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
  const { symbol, buy_price, buy_date, sell_price, sell_date, notes } = req.body ?? {};

  if (!symbol || buy_price == null || !buy_date) {
    throw new HttpError(400, "symbol, buy_price, and buy_date are required");
  }

  await db.insert(userTrades).values({
    userId: req.user!.id,
    symbol: String(symbol).toUpperCase(),
    buyPrice: buy_price,
    buyDate: buy_date,
    sellPrice: sell_price ?? null,
    sellDate: sell_date ?? null,
    notes: notes ?? null,
  });

  res.status(201).json({ success: true });
});

tradesRouter.delete("/:id", async (req, res) => {
  await db
    .delete(userTrades)
    .where(and(eq(userTrades.id, req.params.id), eq(userTrades.userId, req.user!.id)));
  res.json({ success: true });
});
