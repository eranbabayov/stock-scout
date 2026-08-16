import { and, desc, eq, count } from "drizzle-orm";
import { db } from "../db";
import { stockAlerts, users, type StockAlert } from "../db/schema";
import { validateStock, getCurrentPrice, fetchStockData, type StockRow } from "./yahooFinance";
import { calcEMA, calcSMA, type StockDataPoint } from "../../../shared/screener";
import { sendAlertEmail } from "../lib/email";

// Bounds how many symbols the background checker has to poll per user,
// consistent with MAX_WATCHLIST_SIZE/MAX_BATCH_SIZE from the earlier
// scale-readiness pass.
export const MAX_ACTIVE_ALERTS = 20;

export type CreateAlertResult =
  | { ok: true; alert: StockAlert }
  | { ok: false; reason: "invalid_symbol" | "limit_reached" | "no_price_data" };

async function activeAlertCount(userId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(stockAlerts)
    .where(and(eq(stockAlerts.userId, userId), eq(stockAlerts.status, "active")));
  return total;
}

export async function createPriceAlert(userId: string, rawSymbol: string, targetPrice: number): Promise<CreateAlertResult> {
  const symbol = rawSymbol.toUpperCase();

  const { valid } = await validateStock(symbol);
  if (!valid) return { ok: false, reason: "invalid_symbol" };

  const currentPrice = await getCurrentPrice(symbol);
  if (currentPrice == null) return { ok: false, reason: "no_price_data" };

  if ((await activeAlertCount(userId)) >= MAX_ACTIVE_ALERTS) return { ok: false, reason: "limit_reached" };

  const direction = currentPrice < targetPrice ? "above" : "below";

  const [alert] = await db
    .insert(stockAlerts)
    .values({ userId, symbol, kind: "price", targetPrice, direction })
    .returning();

  return { ok: true, alert };
}

export async function createMovingAverageAlert(
  userId: string,
  rawSymbol: string,
  indicatorType: "EMA" | "SMA",
  indicatorPeriod: number
): Promise<CreateAlertResult> {
  const symbol = rawSymbol.toUpperCase();

  const { valid } = await validateStock(symbol);
  if (!valid) return { ok: false, reason: "invalid_symbol" };

  const [currentPrice, historical] = await Promise.all([
    getCurrentPrice(symbol),
    fetchStockData([symbol], "1y").then((r) => r[symbol]),
  ]);
  if (currentPrice == null || !Array.isArray(historical) || historical.length === 0) {
    return { ok: false, reason: "no_price_data" };
  }

  const maValue = computeMaValue(historical as StockDataPoint[], indicatorType, indicatorPeriod);
  if (maValue == null) return { ok: false, reason: "no_price_data" };

  if ((await activeAlertCount(userId)) >= MAX_ACTIVE_ALERTS) return { ok: false, reason: "limit_reached" };

  const direction = currentPrice < maValue ? "above" : "below";

  const [alert] = await db
    .insert(stockAlerts)
    .values({ userId, symbol, kind: "moving_average", indicatorType, indicatorPeriod, direction })
    .returning();

  return { ok: true, alert };
}

export async function listAlerts(userId: string): Promise<StockAlert[]> {
  return db.select().from(stockAlerts).where(eq(stockAlerts.userId, userId)).orderBy(desc(stockAlerts.createdAt));
}

export async function deleteAlert(userId: string, alertId: string): Promise<boolean> {
  const deleted = await db
    .delete(stockAlerts)
    .where(and(eq(stockAlerts.id, alertId), eq(stockAlerts.userId, userId)))
    .returning({ id: stockAlerts.id });
  return deleted.length > 0;
}

export async function findActiveAlertsBySymbol(userId: string, symbol: string): Promise<StockAlert[]> {
  return db
    .select()
    .from(stockAlerts)
    .where(
      and(eq(stockAlerts.userId, userId), eq(stockAlerts.symbol, symbol.toUpperCase()), eq(stockAlerts.status, "active"))
    )
    .orderBy(desc(stockAlerts.createdAt));
}

function computeMaValue(data: StockDataPoint[], type: "EMA" | "SMA", period: number): number | null {
  const series = type === "SMA" ? calcSMA(data, period) : calcEMA(data, period);
  return series.length > 0 ? series[series.length - 1].value : null;
}

function describeAlert(alert: StockAlert): string {
  return alert.kind === "price"
    ? `reached your target price of $${alert.targetPrice}`
    : `crossed ${alert.direction} its ${alert.indicatorPeriod}-day ${alert.indicatorType}`;
}

/**
 * Checks every active alert against a near-live price and fires (one-shot)
 * any whose current price/MA relationship now matches its stored `direction`.
 * Symbols are deduped up front so each one is fetched once regardless of how
 * many alerts — across however many users — reference it; the actual network
 * calls go through the same limiter/cache as every other Yahoo Finance path.
 */
export async function checkAlerts(): Promise<void> {
  const active = await db.select().from(stockAlerts).where(eq(stockAlerts.status, "active"));
  if (active.length === 0) {
    console.log("Alert check: no active alerts.");
    return;
  }

  const symbols = [...new Set(active.map((a) => a.symbol))];
  console.log(`Alert check: evaluating ${active.length} active alert(s) across ${symbols.length} symbol(s): ${symbols.join(", ")}`);

  const [prices, historicalBySymbol] = await Promise.all([
    Promise.all(symbols.map(async (symbol) => [symbol, await getCurrentPrice(symbol)] as const)).then(
      (entries) => Object.fromEntries(entries) as Record<string, number | null>
    ),
    fetchStockData(symbols, "1y"),
  ]);

  let triggeredCount = 0;

  for (const alert of active) {
    const currentPrice = prices[alert.symbol];
    if (currentPrice == null) {
      console.log(`  ${alert.symbol} (${alert.kind}): couldn't fetch a current price, skipping this pass.`);
      continue;
    }

    let compareValue: number;
    let compareLabel: string;
    if (alert.kind === "price") {
      if (alert.targetPrice == null) continue;
      compareValue = alert.targetPrice;
      compareLabel = `target $${compareValue}`;
    } else {
      const historical = historicalBySymbol[alert.symbol];
      if (!Array.isArray(historical) || alert.indicatorType == null || alert.indicatorPeriod == null) continue;
      const maValue = computeMaValue(historical as StockRow[] as StockDataPoint[], alert.indicatorType, alert.indicatorPeriod);
      if (maValue == null) {
        console.log(`  ${alert.symbol}: not enough price history to compute its ${alert.indicatorPeriod}-day ${alert.indicatorType} yet.`);
        continue;
      }
      compareValue = maValue;
      compareLabel = `${alert.indicatorPeriod}-day ${alert.indicatorType} $${compareValue}`;
    }

    const currentRelationship = currentPrice >= compareValue ? "above" : "below";
    const willFire = currentRelationship === alert.direction;
    console.log(
      `  ${alert.symbol} (${alert.kind}): current $${currentPrice} is ${currentRelationship} ${compareLabel}, ` +
        `waiting for "${alert.direction}" -> ${willFire ? "FIRING" : "not yet"}`
    );
    if (!willFire) continue;

    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, alert.userId)).limit(1);
    if (user) {
      await sendAlertEmail(user.email, {
        symbol: alert.symbol,
        description: describeAlert(alert),
        currentPrice,
      })
        .then(() => console.log(`  -> email sent to ${user.email} for ${alert.symbol}`))
        .catch((err) => console.error(`Failed to send alert email for ${alert.symbol}:`, err));
    }

    await db.update(stockAlerts).set({ status: "triggered", triggeredAt: new Date() }).where(eq(stockAlerts.id, alert.id));
    triggeredCount++;
  }

  console.log(`Alert check complete: ${triggeredCount} triggered, ${active.length - triggeredCount} still active.`);
}
