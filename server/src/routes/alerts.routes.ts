import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { createPriceAlert, createMovingAverageAlert, listAlerts, deleteAlert } from "../services/alerts";

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

alertsRouter.get("/", async (req, res) => {
  res.json(await listAlerts(req.user!.id));
});

function resultToResponse(result: { ok: true; alert: unknown } | { ok: false; reason: string }) {
  if (result.ok) return { status: 201, body: result.alert };

  const messages: Record<string, string> = {
    invalid_symbol: "Not a valid, tradeable stock symbol",
    limit_reached: "You've reached the maximum number of active alerts",
    no_price_data: "Couldn't fetch current price data for that symbol right now",
  };
  return { status: 400, body: { error: messages[result.reason] ?? "Couldn't create that alert" } };
}

alertsRouter.post("/", async (req, res) => {
  const { symbol, kind, target_price, indicator_type, indicator_period } = req.body ?? {};

  if (!symbol || !kind) {
    throw new HttpError(400, "symbol and kind are required");
  }

  if (kind === "price") {
    if (target_price == null || Number(target_price) <= 0) {
      throw new HttpError(400, "target_price is required and must be greater than 0 for a price alert");
    }
    const result = await createPriceAlert(req.user!.id, String(symbol), Number(target_price));
    const { status, body } = resultToResponse(result);
    res.status(status).json(body);
    return;
  }

  if (kind === "moving_average") {
    if ((indicator_type !== "EMA" && indicator_type !== "SMA") || !indicator_period || Number(indicator_period) <= 0) {
      throw new HttpError(400, "indicator_type ('EMA'|'SMA') and a positive indicator_period are required for a moving-average alert");
    }
    const result = await createMovingAverageAlert(req.user!.id, String(symbol), indicator_type, Number(indicator_period));
    const { status, body } = resultToResponse(result);
    res.status(status).json(body);
    return;
  }

  throw new HttpError(400, "kind must be 'price' or 'moving_average'");
});

alertsRouter.delete("/:id", async (req, res) => {
  await deleteAlert(req.user!.id, req.params.id);
  res.json({ success: true });
});
