import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const stocksRouter = Router();

stocksRouter.use(requireAuth);

stocksRouter.get("/", async (req, res) => {
  const stocks = await db
    .select()
    .from(userStocks)
    .where(eq(userStocks.userId, req.user!.id))
    .orderBy(asc(userStocks.addedAt));
  res.json(stocks);
});

stocksRouter.post("/", async (req, res) => {
  const { symbol } = req.body ?? {};
  if (!symbol) {
    throw new HttpError(400, "symbol is required");
  }

  const upperSymbol = String(symbol).toUpperCase();

  const [existing] = await db
    .select({ id: userStocks.id })
    .from(userStocks)
    .where(and(eq(userStocks.userId, req.user!.id), eq(userStocks.symbol, upperSymbol)))
    .limit(1);
  if (existing) {
    throw new HttpError(409, "Already in watchlist");
  }

  await db.insert(userStocks).values({ userId: req.user!.id, symbol: upperSymbol });
  res.status(201).json({ success: true });
});

stocksRouter.delete("/:symbol", async (req, res) => {
  const upperSymbol = req.params.symbol.toUpperCase();
  await db
    .delete(userStocks)
    .where(and(eq(userStocks.userId, req.user!.id), eq(userStocks.symbol, upperSymbol)));
  res.json({ success: true });
});
