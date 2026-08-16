import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { userTrades, type UserTrade } from "../db/schema";

export interface AddTradeInput {
  symbol: string;
  direction?: "long" | "short";
  quantity?: number;
  buyPrice: number;
  buyDate: string;
  sellPrice?: number | null;
  sellDate?: string | null;
  notes?: string | null;
}

export interface UpdateTradeInput {
  direction?: "long" | "short";
  quantity?: number;
  buyPrice?: number;
  buyDate?: string;
  sellPrice?: number | null;
  sellDate?: string | null;
  notes?: string | null;
}

function assertValidQuantity(quantity: number | undefined) {
  if (quantity != null && quantity <= 0) {
    throw new Error("quantity must be greater than 0");
  }
}

export async function addTrade(userId: string, input: AddTradeInput): Promise<UserTrade> {
  assertValidQuantity(input.quantity);

  const [row] = await db
    .insert(userTrades)
    .values({
      userId,
      symbol: input.symbol.toUpperCase(),
      direction: input.direction ?? "long",
      quantity: input.quantity ?? 1,
      buyPrice: input.buyPrice,
      buyDate: input.buyDate,
      sellPrice: input.sellPrice ?? null,
      sellDate: input.sellDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return row;
}

export async function listTrades(userId: string): Promise<UserTrade[]> {
  return db.select().from(userTrades).where(eq(userTrades.userId, userId)).orderBy(desc(userTrades.buyDate));
}

export async function updateTrade(userId: string, tradeId: string, input: UpdateTradeInput): Promise<boolean> {
  assertValidQuantity(input.quantity);

  const updates: Partial<typeof userTrades.$inferInsert> = { updatedAt: new Date() };
  if (input.direction != null) updates.direction = input.direction;
  if (input.quantity != null) updates.quantity = input.quantity;
  if (input.buyPrice != null) updates.buyPrice = input.buyPrice;
  if (input.buyDate != null) updates.buyDate = input.buyDate;
  if (input.sellPrice !== undefined) updates.sellPrice = input.sellPrice;
  if (input.sellDate !== undefined) updates.sellDate = input.sellDate;
  if (input.notes !== undefined) updates.notes = input.notes;

  const [updated] = await db
    .update(userTrades)
    .set(updates)
    .where(and(eq(userTrades.id, tradeId), eq(userTrades.userId, userId)))
    .returning({ id: userTrades.id });

  return !!updated;
}

export async function deleteTrade(userId: string, tradeId: string): Promise<boolean> {
  const deleted = await db
    .delete(userTrades)
    .where(and(eq(userTrades.id, tradeId), eq(userTrades.userId, userId)))
    .returning({ id: userTrades.id });
  return deleted.length > 0;
}

/** Trades for a symbol that don't have a sell price yet — candidates for "close this trade". */
export async function findOpenTradesBySymbol(userId: string, symbol: string): Promise<UserTrade[]> {
  return db
    .select()
    .from(userTrades)
    .where(and(eq(userTrades.userId, userId), eq(userTrades.symbol, symbol.toUpperCase()), isNull(userTrades.sellPrice)))
    .orderBy(desc(userTrades.buyDate));
}

export async function findTradesBySymbol(
  userId: string,
  symbol: string,
  buyDate?: string
): Promise<UserTrade[]> {
  const conditions = [eq(userTrades.userId, userId), eq(userTrades.symbol, symbol.toUpperCase())];
  if (buyDate) conditions.push(eq(userTrades.buyDate, buyDate));

  return db
    .select()
    .from(userTrades)
    .where(and(...conditions))
    .orderBy(desc(userTrades.buyDate));
}
