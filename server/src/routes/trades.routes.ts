import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { userTrades } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const tradesRouter = Router();

tradesRouter.use(requireAuth);

tradesRouter.get("/", async (req, res) => {
  const trades = await db
    .select()
    .from(userTrades)
    .where(eq(userTrades.userId, req.user!.id))
    .orderBy(desc(userTrades.buyDate));
  res.json(trades);
});

tradesRouter.post("/", async (req, res) => {
  const { symbol, direction, quantity, buy_price, buy_date, sell_price, sell_date, notes } = req.body ?? {};

  if (!symbol || buy_price == null || !buy_date) {
    throw new HttpError(400, "symbol, buy_price, and buy_date are required");
  }

  if (direction != null && direction !== "long" && direction !== "short") {
    throw new HttpError(400, "direction must be 'long' or 'short'");
  }

  if (quantity != null && Number(quantity) <= 0) {
    throw new HttpError(400, "quantity must be greater than 0");
  }

  await db.insert(userTrades).values({
    userId: req.user!.id,
    symbol: String(symbol).toUpperCase(),
    direction: direction ?? "long",
    quantity: quantity != null ? Number(quantity) : 1,
    buyPrice: buy_price,
    buyDate: buy_date,
    sellPrice: sell_price ?? null,
    sellDate: sell_date ?? null,
    notes: notes ?? null,
  });

  res.status(201).json({ success: true });
});

tradesRouter.patch("/:id", async (req, res) => {
  const { direction, quantity, buy_price, buy_date, sell_price, sell_date, notes } = req.body ?? {};

  if (direction != null && direction !== "long" && direction !== "short") {
    throw new HttpError(400, "direction must be 'long' or 'short'");
  }

  if (quantity != null && Number(quantity) <= 0) {
    throw new HttpError(400, "quantity must be greater than 0");
  }

  const updates: Partial<typeof userTrades.$inferInsert> = { updatedAt: new Date() };
  if (direction != null) updates.direction = direction;
  if (quantity != null) updates.quantity = Number(quantity);
  if (buy_price != null) updates.buyPrice = Number(buy_price);
  if (buy_date != null) updates.buyDate = buy_date;
  if (sell_price !== undefined) updates.sellPrice = sell_price === null || sell_price === "" ? null : Number(sell_price);
  if (sell_date !== undefined) updates.sellDate = sell_date === null || sell_date === "" ? null : sell_date;
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db
    .update(userTrades)
    .set(updates)
    .where(and(eq(userTrades.id, req.params.id), eq(userTrades.userId, req.user!.id)))
    .returning({ id: userTrades.id });

  if (!updated) {
    throw new HttpError(404, "Trade not found");
  }

  res.json({ success: true });
});

tradesRouter.delete("/:id", async (req, res) => {
  await db
    .delete(userTrades)
    .where(and(eq(userTrades.id, req.params.id), eq(userTrades.userId, req.user!.id)));
  res.json({ success: true });
});
