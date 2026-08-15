import { pgTable, pgEnum, uuid, text, timestamp, doublePrecision, bigint, date, unique, index } from "drizzle-orm/pg-core";

export const tradeDirectionEnum = pgEnum("trade_direction", ["long", "short"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userStocks = pgTable(
  "user_stocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.symbol), index("idx_user_stocks_user_id").on(t.userId)],
);

export const stockCache = pgTable(
  "stock_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    date: date("date").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    close: doublePrecision("close").notNull(),
    volume: bigint("volume", { mode: "number" }),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.symbol, t.date), index("idx_stock_cache_symbol_date").on(t.symbol, t.date.desc())],
);

export const userTrades = pgTable(
  "user_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    direction: tradeDirectionEnum("direction").notNull().default("long"),
    quantity: doublePrecision("quantity").notNull().default(1),
    buyPrice: doublePrecision("buy_price").notNull(),
    buyDate: date("buy_date").notNull(),
    sellPrice: doublePrecision("sell_price"),
    sellDate: date("sell_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_user_trades_user_id").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type UserStock = typeof userStocks.$inferSelect;
export type StockCache = typeof stockCache.$inferSelect;
export type UserTrade = typeof userTrades.$inferSelect;
