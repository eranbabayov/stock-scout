import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { addStockToWatchlist, removeStockFromWatchlist } from "../services/watchlist";

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

  const result = await addStockToWatchlist(req.user!.id, String(symbol));
  switch (result) {
    case "invalid":
      throw new HttpError(400, `"${String(symbol).toUpperCase()}" is not a valid stock symbol`);
    case "duplicate":
      throw new HttpError(409, "Already in watchlist");
    case "limit_reached":
      throw new HttpError(409, "Watchlist is at its size limit");
    case "added":
      res.status(201).json({ success: true });
  }
});

stocksRouter.delete("/:symbol", async (req, res) => {
  await removeStockFromWatchlist(req.user!.id, req.params.symbol);
  res.json({ success: true });
});
