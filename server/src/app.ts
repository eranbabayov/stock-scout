import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes";
import { stocksRouter } from "./routes/stocks.routes";
import { tradesRouter } from "./routes/trades.routes";
import { stockDataRouter } from "./routes/stock-data.routes";
import { errorHandler } from "./middleware/errorHandler";

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

  app.use("/api/auth", authRouter);
  app.use("/api/stocks", stocksRouter);
  app.use("/api/trades", tradesRouter);
  app.use("/api/stock-data", stockDataRouter);

  app.use(errorHandler);

  return app;
}
