import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { validateStock } from "./yahooFinance";

// Enforced in one place so both the REST API and the Telegram agent are
// bound by the same limits, regardless of which one a request comes through.
export const MAX_WATCHLIST_SIZE = 50;
export const MAX_BATCH_SIZE = 25;

export type AddStockResult = "added" | "duplicate" | "invalid" | "limit_reached";
export type RemoveStockResult = "removed" | "not_found";

export async function addStockToWatchlist(userId: string, rawSymbol: string): Promise<AddStockResult> {
  const symbol = rawSymbol.toUpperCase();

  const { valid } = await validateStock(symbol);
  if (!valid) return "invalid";

  const [existing] = await db
    .select({ id: userStocks.id })
    .from(userStocks)
    .where(and(eq(userStocks.userId, userId), eq(userStocks.symbol, symbol)))
    .limit(1);
  if (existing) return "duplicate";

  const [{ total }] = await db
    .select({ total: count() })
    .from(userStocks)
    .where(eq(userStocks.userId, userId));
  if (total >= MAX_WATCHLIST_SIZE) return "limit_reached";

  try {
    await db.insert(userStocks).values({ userId, symbol });
    return "added";
  } catch (err) {
    // Check-then-insert isn't atomic — two near-simultaneous adds of the same
    // symbol (e.g. web app + Telegram at once) can both pass the "existing"
    // check above before either inserts. The unique(user_id, symbol)
    // constraint catches that race; treat it the same as a normal duplicate
    // instead of surfacing a raw DB error.
    if ((err as { code?: string }).code === "23505") return "duplicate";
    throw err;
  }
}

export async function removeStockFromWatchlist(userId: string, rawSymbol: string): Promise<RemoveStockResult> {
  const symbol = rawSymbol.toUpperCase();
  const deleted = await db
    .delete(userStocks)
    .where(and(eq(userStocks.userId, userId), eq(userStocks.symbol, symbol)))
    .returning({ id: userStocks.id });
  return deleted.length > 0 ? "removed" : "not_found";
}
