import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { addTrade, listTrades, updateTrade, deleteTrade } from "../services/trades";

export const tradesRouter = Router();

tradesRouter.use(requireAuth);

tradesRouter.get("/", async (req, res) => {
  res.json(await listTrades(req.user!.id));
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

  await addTrade(req.user!.id, {
    symbol: String(symbol),
    direction,
    quantity: quantity != null ? Number(quantity) : undefined,
    buyPrice: Number(buy_price),
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

  const updated = await updateTrade(req.user!.id, req.params.id, {
    direction,
    quantity: quantity != null ? Number(quantity) : undefined,
    buyPrice: buy_price != null ? Number(buy_price) : undefined,
    buyDate: buy_date ?? undefined,
    sellPrice: sell_price !== undefined ? (sell_price === null || sell_price === "" ? null : Number(sell_price)) : undefined,
    sellDate: sell_date !== undefined ? (sell_date === null || sell_date === "" ? null : sell_date) : undefined,
    notes: notes !== undefined ? notes || null : undefined,
  });

  if (!updated) {
    throw new HttpError(404, "Trade not found");
  }

  res.json({ success: true });
});

tradesRouter.delete("/:id", async (req, res) => {
  await deleteTrade(req.user!.id, req.params.id);
  res.json({ success: true });
});
