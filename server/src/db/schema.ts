import { pgTable, pgEnum, uuid, text, timestamp, doublePrecision, integer, boolean, bigint, date, unique, index } from "drizzle-orm/pg-core";

export const tradeDirectionEnum = pgEnum("trade_direction", ["long", "short"]);
export const alertKindEnum = pgEnum("alert_kind", ["price", "moving_average"]);
export const alertDirectionEnum = pgEnum("alert_direction", ["above", "below"]);
export const alertStatusEnum = pgEnum("alert_status", ["active", "triggered"]);
export const movingAverageTypeEnum = pgEnum("moving_average_type", ["EMA", "SMA"]);
export const drawingTypeEnum = pgEnum("drawing_type", ["trendline", "ray", "horizontal"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  // Paying-user flag — exempts the account from the watchlist size cap (see
  // MAX_WATCHLIST_SIZE in watchlist.ts). Set manually for now; wire up to
  // real billing once that exists.
  isPremium: boolean("is_premium").notNull().default(false),
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

// A named, user-created grouping of symbols (e.g. "Tech stocks"). A symbol
// can belong to more than one list at once — membership lives in
// watchlistListItems below, not on userStocks itself. Exactly one list per
// user has isDefault=true: the target for Telegram's watchlist tools (which
// don't expose the list concept) and where existing stocks land on upgrade.
export const watchlistLists = pgTable(
  "watchlist_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_watchlist_lists_user_id").on(t.userId)],
);

export const watchlistListItems = pgTable(
  "watchlist_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => watchlistLists.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    // Drag-to-reorder position within the list (lower = higher up). Assigned
    // as max+1 on insert; rewritten in bulk by reorderListItems.
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.listId, t.symbol), index("idx_watchlist_list_items_list_id").on(t.listId, t.sortOrder)],
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
  // Composite index also serves plain userId-only lookups (leftmost-prefix),
  // so this replaces rather than duplicates a userId-only index. The trade
  // tools filter by (userId, symbol) on every add_trade/close_trade/remove_trade call.
  (t) => [index("idx_user_trades_user_symbol").on(t.userId, t.symbol)],
);

export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    kind: alertKindEnum("kind").notNull(),
    targetPrice: doublePrecision("target_price"),
    indicatorType: movingAverageTypeEnum("indicator_type"),
    indicatorPeriod: integer("indicator_period"),
    // Computed once at creation from the current price/MA relationship (e.g.
    // price below target -> "above", meaning "notify once it rises through
    // this"). Triggers the moment the live relationship matches this value.
    direction: alertDirectionEnum("direction").notNull(),
    status: alertStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  },
  // The checker's main query is "all active alerts, grouped by symbol".
  (t) => [index("idx_stock_alerts_status_symbol").on(t.status, t.symbol)],
);

// A user-drawn trendline/ray/horizontal line on a symbol's chart. Anchored to
// bars by their actual date (not a raw pixel/time value), so a magnet-snapped
// drawing stays correctly pinned to that bar's close across re-renders.
// p2Date/p2Price are unused for "horizontal" (only p1Price matters there).
export const chartDrawings = pgTable(
  "chart_drawings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    type: drawingTypeEnum("type").notNull(),
    p1Date: date("p1_date").notNull(),
    p1Price: doublePrecision("p1_price").notNull(),
    p2Date: date("p2_date"),
    p2Price: doublePrecision("p2_price"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_chart_drawings_user_symbol").on(t.userId, t.symbol)],
);

export const telegramLinks = pgTable(
  "telegram_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramChatId: text("telegram_chat_id").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    // Refreshed on every processed message. A gap of >10 minutes since this
    // drops the chat to read-only until a write is attempted and re-verified
    // (see telegramConversation.ts). linkedAt itself is the separate, absolute
    // 7-day link lifetime — this is the shorter, rolling write-access window.
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when a write is attempted while read-only: holds the original
    // message text so it can be replayed automatically once the user
    // confirms the emailed step-up code.
    pendingActionText: text("pending_action_text"),
  },
  (t) => [index("idx_telegram_links_user_id").on(t.userId)],
);

export const telegramOtpCodes = pgTable(
  "telegram_otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramChatId: text("telegram_chat_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_telegram_otp_codes_chat_id").on(t.telegramChatId)],
);

// Rules the strong Telegram-agent model writes after handling a request the
// weak model escalated, so the weak model can handle similar future requests
// itself instead of escalating again. See claudeAgent.ts.
export const agentPlaybook = pgTable(
  "agent_playbook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    triggerSummary: text("trigger_summary").notNull(),
    ruleText: text("rule_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_agent_playbook_created_at").on(t.createdAt.desc())],
);

export type User = typeof users.$inferSelect;
export type UserStock = typeof userStocks.$inferSelect;
export type StockCache = typeof stockCache.$inferSelect;
export type UserTrade = typeof userTrades.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type AgentPlaybookRule = typeof agentPlaybook.$inferSelect;
export type TelegramOtpCode = typeof telegramOtpCodes.$inferSelect;
export type StockAlert = typeof stockAlerts.$inferSelect;
export type WatchlistList = typeof watchlistLists.$inferSelect;
export type WatchlistListItem = typeof watchlistListItems.$inferSelect;
export type ChartDrawing = typeof chartDrawings.$inferSelect;
