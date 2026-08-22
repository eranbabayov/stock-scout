import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { listDrawings, createDrawing, updateDrawing, deleteDrawing, type DrawingType } from "../services/chartDrawings";

export const chartDrawingsRouter = Router();

chartDrawingsRouter.use(requireAuth);

const VALID_TYPES: DrawingType[] = ["trendline", "ray", "horizontal"];

chartDrawingsRouter.get("/", async (req, res) => {
  const { symbol } = req.query;
  if (!symbol || typeof symbol !== "string") {
    throw new HttpError(400, "symbol query param is required");
  }
  res.json(await listDrawings(req.user!.id, symbol));
});

chartDrawingsRouter.post("/", async (req, res) => {
  const { symbol, type, p1_date, p1_price, p2_date, p2_price } = req.body ?? {};

  if (!symbol || !VALID_TYPES.includes(type)) {
    throw new HttpError(400, `symbol is required and type must be one of ${VALID_TYPES.join(", ")}`);
  }
  if (!p1_date || p1_price == null) {
    throw new HttpError(400, "p1_date and p1_price are required");
  }
  if (type !== "horizontal" && (!p2_date || p2_price == null)) {
    throw new HttpError(400, "p2_date and p2_price are required for trendline/ray");
  }

  const drawing = await createDrawing(req.user!.id, {
    symbol: String(symbol),
    type,
    p1Date: String(p1_date),
    p1Price: Number(p1_price),
    p2Date: p2_date ? String(p2_date) : null,
    p2Price: p2_price != null ? Number(p2_price) : null,
  });

  res.status(201).json(drawing);
});

chartDrawingsRouter.patch("/:id", async (req, res) => {
  const { p1_date, p1_price, p2_date, p2_price } = req.body ?? {};

  const updated = await updateDrawing(req.user!.id, req.params.id, {
    p1Date: p1_date !== undefined ? String(p1_date) : undefined,
    p1Price: p1_price !== undefined ? Number(p1_price) : undefined,
    p2Date: p2_date !== undefined ? (p2_date === null ? null : String(p2_date)) : undefined,
    p2Price: p2_price !== undefined ? (p2_price === null ? null : Number(p2_price)) : undefined,
  });

  if (!updated) {
    throw new HttpError(404, "Drawing not found");
  }
  res.json(updated);
});

chartDrawingsRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteDrawing(req.user!.id, req.params.id);
  if (!deleted) {
    throw new HttpError(404, "Drawing not found");
  }
  res.json({ success: true });
});
