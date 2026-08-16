import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { watchlistLists, watchlistListItems, type WatchlistList } from "../db/schema";
import { cleanupOrphanedStock } from "./watchlist";

// Bounds how many lists a user can create, consistent with the other caps
// (MAX_WATCHLIST_SIZE, MAX_ACTIVE_ALERTS) from the scale-readiness pass.
export const MAX_WATCHLIST_LISTS = 10;

export interface WatchlistListWithSymbols extends WatchlistList {
  symbols: string[];
}

export type CreateListResult = { ok: true; list: WatchlistList } | { ok: false; reason: "limit_reached" | "invalid_name" };

export async function listLists(userId: string): Promise<WatchlistListWithSymbols[]> {
  const lists = await db.select().from(watchlistLists).where(eq(watchlistLists.userId, userId)).orderBy(asc(watchlistLists.createdAt));
  if (lists.length === 0) return [];

  const items = await db
    .select({ listId: watchlistListItems.listId, symbol: watchlistListItems.symbol })
    .from(watchlistListItems)
    .where(
      inArray(
        watchlistListItems.listId,
        lists.map((l) => l.id)
      )
    )
    .orderBy(asc(watchlistListItems.sortOrder));

  const symbolsByList = new Map<string, string[]>();
  for (const item of items) {
    const arr = symbolsByList.get(item.listId) ?? [];
    arr.push(item.symbol);
    symbolsByList.set(item.listId, arr);
  }

  return lists.map((list) => ({ ...list, symbols: symbolsByList.get(list.id) ?? [] }));
}

export async function createList(userId: string, rawName: string): Promise<CreateListResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, reason: "invalid_name" };

  const [{ total }] = await db.select({ total: count() }).from(watchlistLists).where(eq(watchlistLists.userId, userId));
  if (total >= MAX_WATCHLIST_LISTS) return { ok: false, reason: "limit_reached" };

  const [list] = await db
    .insert(watchlistLists)
    .values({ userId, name, isDefault: total === 0 })
    .returning();
  return { ok: true, list };
}

export async function deleteList(userId: string, listId: string): Promise<boolean> {
  const [list] = await db
    .select()
    .from(watchlistLists)
    .where(and(eq(watchlistLists.id, listId), eq(watchlistLists.userId, userId)))
    .limit(1);
  if (!list) return false;

  const items = await db.select({ symbol: watchlistListItems.symbol }).from(watchlistListItems).where(eq(watchlistListItems.listId, listId));

  // Cascades watchlist_list_items for this list.
  await db.delete(watchlistLists).where(eq(watchlistLists.id, listId));

  for (const { symbol } of items) {
    await cleanupOrphanedStock(userId, symbol);
  }

  return true;
}

/**
 * Rewrites sortOrder for every symbol in `orderedSymbols` to its index in
 * that array — called with the full post-drag order from the sidebar, not
 * an incremental move, which keeps the persisted order unambiguous.
 */
export async function reorderListItems(userId: string, listId: string, orderedSymbols: string[]): Promise<boolean> {
  const [list] = await db
    .select({ id: watchlistLists.id })
    .from(watchlistLists)
    .where(and(eq(watchlistLists.id, listId), eq(watchlistLists.userId, userId)))
    .limit(1);
  if (!list) return false;

  await Promise.all(
    orderedSymbols.map((symbol, index) =>
      db
        .update(watchlistListItems)
        .set({ sortOrder: index })
        .where(and(eq(watchlistListItems.listId, listId), eq(watchlistListItems.symbol, symbol)))
    )
  );

  return true;
}

/** Case-insensitive lookup by name — the Telegram agent's list-aware tools resolve a user-typed name (e.g. "SOXX") against this rather than needing the list's id. */
export async function findListByName(userId: string, rawName: string): Promise<WatchlistList | null> {
  const name = rawName.trim().toLowerCase();
  const lists = await db.select().from(watchlistLists).where(eq(watchlistLists.userId, userId));
  return lists.find((l) => l.name.toLowerCase() === name) ?? null;
}

export type ResolveOrCreateListResult =
  | { ok: true; list: WatchlistList; created: boolean }
  | { ok: false; reason: "limit_reached" | "invalid_name" };

/** Finds a list by name, creating it (subject to MAX_WATCHLIST_LISTS) if none matches yet — used when adding a stock to a named list that may not exist. */
export async function resolveOrCreateListByName(userId: string, name: string): Promise<ResolveOrCreateListResult> {
  const existing = await findListByName(userId, name);
  if (existing) return { ok: true, list: existing, created: false };

  const result = await createList(userId, name);
  if (result.ok === false) return { ok: false, reason: result.reason };
  return { ok: true, list: result.list, created: true };
}

/** The list Telegram's watchlist tools target — they don't expose the list concept, so everything they add/remove goes through here. */
export async function getOrCreateDefaultListId(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: watchlistLists.id })
    .from(watchlistLists)
    .where(and(eq(watchlistLists.userId, userId), eq(watchlistLists.isDefault, true)))
    .limit(1);
  if (existing) return existing.id;

  const result = await createList(userId, "My Watchlist");
  if (result.ok) return result.list.id;

  // Only reachable if the user is already at MAX_WATCHLIST_LISTS with none
  // marked default (shouldn't happen — createList always marks the first
  // list default) — fall back to whichever list exists rather than failing.
  const [any] = await db.select({ id: watchlistLists.id }).from(watchlistLists).where(eq(watchlistLists.userId, userId)).limit(1);
  if (any) return any.id;

  throw new Error(`Could not resolve or create a default watchlist list for user ${userId}`);
}
