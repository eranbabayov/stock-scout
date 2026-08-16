import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { stockCache } from "../db/schema";
import { ConcurrencyLimiter } from "../lib/concurrencyLimiter";

// A hung upstream request (Yahoo Finance) shouldn't be able to block a request
// indefinitely — cap every outbound fetch and fail fast instead.
const YAHOO_FETCH_TIMEOUT_MS = 10_000;

// Caps total concurrent outbound Yahoo Finance requests across *all* users
// and *all* call paths (screening, validation). Without this, a burst of
// concurrent users with stale caches (e.g. right after market close) could
// fire far more simultaneous requests than Yahoo tolerates, risking
// IP-level rate-limiting that would break stock data for everyone.
const yahooLimiter = new ConcurrencyLimiter(Number(process.env.YAHOO_CONCURRENCY ?? 8));

// Concurrent requests for the same uncached symbol collapse into one
// upstream call instead of firing duplicates — common when several users
// are watching the same popular ticker.
const inFlightFetches = new Map<string, Promise<StockRow[] | { error: string }>>();

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
  };
}

export interface StockRow {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getDay();
  let daysBack = 1;
  if (day === 0) daysBack = 2;
  else if (day === 6) daysBack = 1;
  else if (day === 1) daysBack = 3;

  const lastTrading = new Date(now);
  lastTrading.setDate(lastTrading.getDate() - daysBack);
  return lastTrading.toISOString().split("T")[0];
}

async function getCachedRows(symbol: string): Promise<StockRow[]> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const rows = await db
    .select()
    .from(stockCache)
    .where(and(eq(stockCache.symbol, symbol), gte(stockCache.date, oneYearAgo.toISOString().split("T")[0])))
    .orderBy(asc(stockCache.date));

  return rows as unknown as StockRow[];
}

async function fetchFromYahoo(symbol: string, period: string, cachedData: StockRow[]): Promise<StockRow[] | { error: string }> {
  try {
    const range = period === "1y" ? "1y" : period;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;

    const yahooRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(YAHOO_FETCH_TIMEOUT_MS),
    });

    if (!yahooRes.ok) {
      return { error: `Invalid symbol: ${symbol}` };
    }

    const yahooData = (await yahooRes.json()) as { chart?: { result?: unknown[] } };
    const chart = yahooData.chart?.result?.[0] as YahooChartResult | undefined;

    if (!chart || !chart.timestamp) {
      return { error: `No data for ${symbol}` };
    }

    const quotes = chart.indicators.quote[0];
    const rows: StockRow[] = chart.timestamp
      .map((ts: number, i: number) => {
        const date = new Date(ts * 1000).toISOString().split("T")[0];
        return {
          symbol,
          date,
          open: quotes.open[i] ? Math.round(quotes.open[i] * 100) / 100 : null,
          high: quotes.high[i] ? Math.round(quotes.high[i] * 100) / 100 : null,
          low: quotes.low[i] ? Math.round(quotes.low[i] * 100) / 100 : null,
          close: quotes.close[i] ? Math.round(quotes.close[i] * 100) / 100 : null,
          volume: quotes.volume[i] || null,
        };
      })
      .filter((r: { close: number | null }): r is StockRow => r.close !== null);

    if (rows.length > 0) {
      await db
        .insert(stockCache)
        .values(rows)
        .onConflictDoUpdate({
          target: [stockCache.symbol, stockCache.date],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
            cachedAt: sql`now()`,
          },
        })
        .catch((err) => {
          console.error(`Cache upsert error for ${symbol}:`, err);
        });
    }

    return rows;
  } catch (fetchError) {
    console.error(`Yahoo fetch error for ${symbol}:`, fetchError);
    if (cachedData.length > 0) {
      return cachedData;
    }
    return { error: `Failed to fetch ${symbol}` };
  }
}

async function fetchAndCacheSymbol(symbol: string, period: string): Promise<StockRow[] | { error: string }> {
  const cachedData = await getCachedRows(symbol);

  const hasRecentData =
    cachedData.length > 200 && cachedData[cachedData.length - 1]?.date >= getLastTradingDay();

  if (hasRecentData) {
    return cachedData;
  }

  // Cache is stale/missing — go to the network, but gated by the shared
  // limiter and de-duplicated against any identical request already in flight.
  const key = `${symbol}:${period}`;
  const existing = inFlightFetches.get(key);
  if (existing) return existing;

  const promise = yahooLimiter.run(() => fetchFromYahoo(symbol, period, cachedData));
  inFlightFetches.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightFetches.delete(key);
  }
}

export async function fetchStockData(
  symbols: string[],
  period: string,
): Promise<Record<string, StockRow[] | { error: string }>> {
  // Fired concurrently rather than sequentially — real network concurrency is
  // still bounded by yahooLimiter above, so this just removes the artificial
  // serialization that made large screens slow.
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const upperSymbol = symbol.toUpperCase();
      return [upperSymbol, await fetchAndCacheSymbol(upperSymbol, period)] as const;
    })
  );

  return Object.fromEntries(entries);
}

export async function validateStock(symbol: string): Promise<{ valid: boolean; symbol: string }> {
  const upperSymbol = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${upperSymbol}?range=5d&interval=1d`;

  // A network blip or timeout on one symbol shouldn't take down a whole batch
  // add/remove request — treat it the same as "couldn't confirm this ticker".
  let yahooRes: Response;
  try {
    yahooRes = await yahooLimiter.run(() =>
      fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(YAHOO_FETCH_TIMEOUT_MS),
      })
    );
  } catch {
    return { valid: false, symbol: upperSymbol };
  }
  if (!yahooRes.ok) {
    return { valid: false, symbol: upperSymbol };
  }

  const data = (await yahooRes.json()) as { chart?: { result?: Array<{ timestamp?: number[] }> } };
  const result = data.chart?.result?.[0];
  const valid = !!(result && result.timestamp && result.timestamp.length > 0);

  return { valid, symbol: upperSymbol };
}
