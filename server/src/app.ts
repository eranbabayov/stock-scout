import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes";
import { stocksRouter } from "./routes/stocks.routes";
import { tradesRouter } from "./routes/trades.routes";
import { stockDataRouter } from "./routes/stock-data.routes";
import { errorHandler } from "./middleware/errorHandler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In the production image this is server/src/../../dist == <repo root>/dist,
// where the Vite build output lands (see Dockerfile).
const CLIENT_DIST_DIR = path.join(__dirname, "../../dist");

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "http://localhost:8080",
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());

  // Unauthenticated, no DB access — just proves the process is up, for
  // Docker/orchestrator healthchecks.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/stocks", stocksRouter);
  app.use("/api/trades", tradesRouter);
  app.use("/api/stock-data", stockDataRouter);

  // In dev the frontend is served separately by the Vite dev server (which
  // proxies /api here) — this only serves anything in production, where the
  // built client and this API run out of the same container/process.
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
