import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { listLists, createList, deleteList, reorderListItems } from "../services/watchlistLists";
import { addStockToWatchlist, removeStockFromWatchlist } from "../services/watchlist";

export const watchlistListsRouter = Router();

watchlistListsRouter.use(requireAuth);

watchlistListsRouter.get("/", async (req, res) => {
  res.json(await listLists(req.user!.id));
});

watchlistListsRouter.post("/", async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) {
    throw new HttpError(400, "name is required");
  }

  const result = await createList(req.user!.id, String(name));
  if (!result.ok) {
    const status = result.reason === "limit_reached" ? 409 : 400;
    const message = result.reason === "limit_reached" ? "You've reached the maximum number of lists" : "A list name is required";
    throw new HttpError(status, message);
  }

  res.status(201).json(result.list);
});

watchlistListsRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteList(req.user!.id, req.params.id);
  if (!deleted) {
    throw new HttpError(404, "List not found");
  }
  res.json({ success: true });
});

watchlistListsRouter.post("/:id/stocks", async (req, res) => {
  const { symbol } = req.body ?? {};
  if (!symbol) {
    throw new HttpError(400, "symbol is required");
  }

  const result = await addStockToWatchlist(req.user!.id, String(symbol), req.params.id);
  switch (result) {
    case "invalid":
      throw new HttpError(400, `"${String(symbol).toUpperCase()}" is not a valid stock symbol`);
    case "duplicate":
      throw new HttpError(409, "Already in this list");
    case "limit_reached":
      throw new HttpError(409, "Watchlist is at its size limit");
    case "added":
      res.status(201).json({ success: true });
  }
});

watchlistListsRouter.delete("/:id/stocks/:symbol", async (req, res) => {
  await removeStockFromWatchlist(req.user!.id, req.params.symbol, req.params.id);
  res.json({ success: true });
});

watchlistListsRouter.patch("/:id/reorder", async (req, res) => {
  const { symbols } = req.body ?? {};
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpError(400, "symbols must be a non-empty array");
  }

  const reordered = await reorderListItems(
    req.user!.id,
    req.params.id,
    symbols.map((s: unknown) => String(s).toUpperCase())
  );
  if (!reordered) {
    throw new HttpError(404, "List not found");
  }
  res.json({ success: true });
});
