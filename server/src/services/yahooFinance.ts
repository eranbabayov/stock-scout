import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { stockCache } from "../db/schema";

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

async function fetchAndCacheSymbol(symbol: string, period: string): Promise<StockRow[] | { error: string }> {
  const cachedData = await getCachedRows(symbol);

  const hasRecentData =
    cachedData.length > 200 && cachedData[cachedData.length - 1]?.date >= getLastTradingDay();

  if (hasRecentData) {
    return cachedData;
  }

  try {
    const range = period === "1y" ? "1y" : period;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;

    const yahooRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

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

export async function fetchStockData(
  symbols: string[],
  period: string,
): Promise<Record<string, StockRow[] | { error: string }>> {
  const results: Record<string, StockRow[] | { error: string }> = {};

  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();
    results[upperSymbol] = await fetchAndCacheSymbol(upperSymbol, period);
  }

  return results;
}

export async function validateStock(symbol: string): Promise<{ valid: boolean; symbol: string }> {
  const upperSymbol = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${upperSymbol}?range=5d&interval=1d`;

  const yahooRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!yahooRes.ok) {
    return { valid: false, symbol: upperSymbol };
  }

  const data = (await yahooRes.json()) as { chart?: { result?: Array<{ timestamp?: number[] }> } };
  const result = data.chart?.result?.[0];
  const valid = !!(result && result.timestamp && result.timestamp.length > 0);

  return { valid, symbol: upperSymbol };
}
