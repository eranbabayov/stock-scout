import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { requireAuth } from "../middleware/auth";

export const stocksRouter = Router();

stocksRouter.use(requireAuth);

// Flat view across every list — this is what price-fetching (useStockData)
// and the Analysis screens key off, since screening stays list-agnostic.
// Adding/removing a symbol is now always list-scoped: see
// watchlist-lists.routes.ts's POST/DELETE /:id/stocks.
stocksRouter.get("/", async (req, res) => {
  const stocks = await db
    .select()
    .from(userStocks)
    .where(eq(userStocks.userId, req.user!.id))
    .orderBy(asc(userStocks.addedAt));
  res.json(stocks);
});
