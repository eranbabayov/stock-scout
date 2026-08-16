import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { userStocks, watchlistLists, watchlistListItems } from "../db/schema";
import { validateStock } from "./yahooFinance";

// Enforced in one place so both the REST API and the Telegram agent are
// bound by the same limits, regardless of which one a request comes through.
export const MAX_WATCHLIST_SIZE = 50;
export const MAX_BATCH_SIZE = 25;

export type AddStockResult = "added" | "duplicate" | "invalid" | "limit_reached";
export type RemoveStockResult = "removed" | "not_found";

export async function addStockToWatchlist(userId: string, rawSymbol: string, listId: string): Promise<AddStockResult> {
  const symbol = rawSymbol.toUpperCase();

  // Already in this specific list? Nothing to do, regardless of whether it's
  // also tracked in other lists.
  const [existingInList] = await db
    .select({ id: watchlistListItems.id })
    .from(watchlistListItems)
    .where(and(eq(watchlistListItems.listId, listId), eq(watchlistListItems.symbol, symbol)))
    .limit(1);
  if (existingInList) return "duplicate";

  const [existingStock] = await db
    .select({ id: userStocks.id })
    .from(userStocks)
    .where(and(eq(userStocks.userId, userId), eq(userStocks.symbol, symbol)))
    .limit(1);

  if (!existingStock) {
    // Never tracked anywhere yet — validate it's real and check the overall
    // per-user cap before creating the canonical record. Already-tracked
    // symbols (being added to a second list) skip both checks — they're
    // already known-valid and already counted.
    const { valid } = await validateStock(symbol);
    if (!valid) return "invalid";

    const [{ total }] = await db.select({ total: count() }).from(userStocks).where(eq(userStocks.userId, userId));
    if (total >= MAX_WATCHLIST_SIZE) return "limit_reached";

    try {
      await db.insert(userStocks).values({ userId, symbol });
    } catch (err) {
      // Lost a race with another concurrent add of the same symbol — the row
      // exists now regardless of who won, so just carry on to the list insert.
      if ((err as { code?: string }).code !== "23505") throw err;
    }
  }

  const [lastItem] = await db
    .select({ sortOrder: watchlistListItems.sortOrder })
    .from(watchlistListItems)
    .where(eq(watchlistListItems.listId, listId))
    .orderBy(desc(watchlistListItems.sortOrder))
    .limit(1);
  const nextSortOrder = (lastItem?.sortOrder ?? -1) + 1;

  try {
    await db.insert(watchlistListItems).values({ listId, symbol, sortOrder: nextSortOrder });
    return "added";
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return "duplicate";
    throw err;
  }
}

export async function removeStockFromWatchlist(userId: string, rawSymbol: string, listId: string): Promise<RemoveStockResult> {
  const symbol = rawSymbol.toUpperCase();
  const deleted = await db
    .delete(watchlistListItems)
    .where(and(eq(watchlistListItems.listId, listId), eq(watchlistListItems.symbol, symbol)))
    .returning({ id: watchlistListItems.id });

  if (deleted.length === 0) return "not_found";

  await cleanupOrphanedStock(userId, symbol);
  return "removed";
}

/**
 * Removes the canonical userStocks row for `symbol` once it's no longer in
 * any of the user's lists — keeps price-fetching/caps scoped to symbols that
 * are actually organized somewhere. Also called by watchlistLists.ts's
 * deleteList for every symbol that was only in the list being deleted.
 */
export async function cleanupOrphanedStock(userId: string, symbol: string): Promise<void> {
  const userLists = await db.select({ id: watchlistLists.id }).from(watchlistLists).where(eq(watchlistLists.userId, userId));

  if (userLists.length > 0) {
    const [stillOrganized] = await db
      .select({ id: watchlistListItems.id })
      .from(watchlistListItems)
      .where(
        and(
          inArray(
            watchlistListItems.listId,
            userLists.map((l) => l.id)
          ),
          eq(watchlistListItems.symbol, symbol)
        )
      )
      .limit(1);
    if (stillOrganized) return;
  }

  await db.delete(userStocks).where(and(eq(userStocks.userId, userId), eq(userStocks.symbol, symbol)));
}
