import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { fetchStockData, validateStock } from "../services/yahooFinance";

export const stockDataRouter = Router();

stockDataRouter.use(requireAuth);

stockDataRouter.post("/fetch", async (req, res) => {
  const { symbols, period } = req.body ?? {};

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpError(400, "symbols array is required");
  }

  const results = await fetchStockData(symbols, period ?? "1y");
  res.json(results);
});

stockDataRouter.post("/validate", async (req, res) => {
  const { symbol } = req.body ?? {};

  if (!symbol) {
    throw new HttpError(400, "symbol is required");
  }

  const result = await validateStock(symbol);
  res.json(result);
});
