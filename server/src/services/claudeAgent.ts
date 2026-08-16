import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { fetchStockData, type StockRow } from "./yahooFinance";
import { addStockToWatchlist, removeStockFromWatchlist, MAX_BATCH_SIZE } from "./watchlist";
import {
  addTrade,
  listTrades,
  findOpenTradesBySymbol,
  findTradesBySymbol,
  updateTrade,
  deleteTrade,
} from "./trades";
import type { UserTrade } from "../db/schema";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  FIB_LEVELS,
  checkStocksCombined,
} from "../../../shared/screener";

const AGENT_MAX_ITERATIONS = 10;
const AGENT_TIMEOUT_MS = 60_000;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set to use the Telegram assistant");
  }
  client = new Anthropic();
  return client;
}

async function getWatchlistSymbols(userId: string): Promise<string[]> {
  const rows = await db
    .select({ symbol: userStocks.symbol })
    .from(userStocks)
    .where(eq(userStocks.userId, userId))
    .orderBy(asc(userStocks.addedAt));
  return rows.map((r) => r.symbol);
}

const indicatorSchema = z.object({
  type: z.enum(["EMA", "SMA"]),
  period: z.number().int().positive(),
});

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function formatTrade(trade: UserTrade): string {
  const base = `${trade.symbol} (${trade.direction}, qty ${trade.quantity}) bought $${trade.buyPrice} on ${trade.buyDate}`;
  if (trade.sellPrice == null) return `${base} — open`;

  const perShare = trade.direction === "short" ? trade.buyPrice - trade.sellPrice : trade.sellPrice - trade.buyPrice;
  const pnl = Math.round(perShare * trade.quantity * 100) / 100;
  const pnlPercent = Math.round((perShare / trade.buyPrice) * 100 * 100) / 100;
  return `${base}, sold $${trade.sellPrice} on ${trade.sellDate} — P&L ${pnl >= 0 ? "+" : ""}$${pnl} (${pnlPercent}%)`;
}

function buildTools(userId: string) {
  const addStock = betaZodTool({
    name: "add_stocks_to_watchlist",
    description:
      `Add one or more stock symbols to the user's watchlist in a single call (max ${MAX_BATCH_SIZE} per call, ` +
      "and the watchlist itself has a size limit). Validates each symbol is a real, tradeable ticker first. " +
      "Pass every symbol the user wants added at once — don't call this tool once per symbol.",
    inputSchema: z.object({
      symbols: z
        .array(z.string())
        .min(1)
        .describe("Stock tickers to add, e.g. [\"AAPL\", \"MSFT\", \"NVDA\"]"),
    }),
    run: async ({ symbols }) => {
      if (symbols.length > MAX_BATCH_SIZE) {
        return (
          `That's ${symbols.length} symbols, but I can only process ${MAX_BATCH_SIZE} at a time. ` +
          "Please ask again with a smaller batch."
        );
      }

      const results: string[] = [];
      for (const raw of symbols) {
        const upperSymbol = raw.toUpperCase();
        const outcome = await addStockToWatchlist(userId, upperSymbol);
        const label =
          outcome === "added"
            ? "added"
            : outcome === "duplicate"
            ? "already on watchlist"
            : outcome === "limit_reached"
            ? "skipped — watchlist is full"
            : "not a valid symbol";
        results.push(`${upperSymbol}: ${label}`);
      }

      return results.join("\n");
    },
  });

  const removeStock = betaZodTool({
    name: "remove_stocks_from_watchlist",
    description:
      `Remove one or more stock symbols from the user's watchlist in a single call (max ${MAX_BATCH_SIZE} per ` +
      "call). Pass every symbol the user wants removed at once — don't call this tool once per symbol.",
    inputSchema: z.object({
      symbols: z.array(z.string()).min(1).describe("Stock tickers to remove, e.g. [\"AAPL\", \"MSFT\"]"),
    }),
    run: async ({ symbols }) => {
      if (symbols.length > MAX_BATCH_SIZE) {
        return (
          `That's ${symbols.length} symbols, but I can only process ${MAX_BATCH_SIZE} at a time. ` +
          "Please ask again with a smaller batch."
        );
      }

      const results: string[] = [];
      for (const raw of symbols) {
        const upperSymbol = raw.toUpperCase();
        const outcome = await removeStockFromWatchlist(userId, upperSymbol);
        results.push(`${upperSymbol}: ${outcome === "removed" ? "removed" : "wasn't on watchlist"}`);
      }

      return results.join("\n");
    },
  });

  const listWatchlist = betaZodTool({
    name: "list_watchlist",
    description: "List every stock symbol currently on the user's watchlist.",
    inputSchema: z.object({}),
    run: async () => {
      const symbols = await getWatchlistSymbols(userId);
      return symbols.length > 0 ? symbols.join(", ") : "The watchlist is empty.";
    },
  });

  const screenWatchlist = betaZodTool({
    name: "screen_watchlist",
    description:
      "Scan the user's watchlist for stocks matching moving-average and/or Fibonacci retracement conditions. " +
      "Every condition given must hold (AND, not OR) for a stock to match. " +
      `Valid Fibonacci levels: ${FIB_LEVELS.join(", ")}.`,
    inputSchema: z.object({
      indicators: z
        .array(indicatorSchema)
        .describe("Moving averages to require the price to be within threshold of, e.g. [{type:'EMA',period:150}]"),
      fib_level: z
        .number()
        .nullable()
        .optional()
        .describe("Fibonacci retracement level to require, or null/omit to skip Fib screening"),
      lower_threshold_percent: z
        .number()
        .default(0)
        .describe("Minimum % above the indicator/level for a match"),
      upper_threshold_percent: z
        .number()
        .default(5)
        .describe("Maximum % above the indicator/level for a match"),
    }),
    run: async ({ indicators, fib_level, lower_threshold_percent, upper_threshold_percent }) => {
      const symbols = await getWatchlistSymbols(userId);
      if (symbols.length === 0) return "The watchlist is empty, nothing to screen.";

      const raw = await fetchStockData(symbols, "1y");
      const stocksData: Record<string, StockDataPoint[]> = {};
      for (const [symbol, rows] of Object.entries(raw)) {
        if (Array.isArray(rows)) stocksData[symbol] = rows as StockRow[] as StockDataPoint[];
      }

      // checkStocksCombined's fibLevel type is narrowed to the frontend's radio-button
      // options, but the underlying math accepts any percentage — the agent lets the
      // user name an arbitrary level (e.g. "fib 62"), so widen the type here.
      const matches = checkStocksCombined(
        stocksData,
        indicators as MovingAverageIndicator[],
        (fib_level ?? null) as (typeof FIB_LEVELS)[number] | null,
        lower_threshold_percent,
        upper_threshold_percent
      );

      const entries = Object.entries(matches);
      if (entries.length === 0) return "No watchlist stocks matched those conditions.";

      return entries
        .map(([symbol, match]) => {
          const maParts = Object.entries(match.maMatches).map(([k, v]) => `${k} +${v}%`);
          const fibPart = match.fib ? [`Fib${fib_level} +${match.fib.percentFromLevel}% (level $${match.fib.levelPrice})`] : [];
          return `${symbol}: ${[...maParts, ...fibPart].join(", ")}`;
        })
        .join("\n");
    },
  });

  const addTradeTool = betaZodTool({
    name: "add_trade",
    description:
      "Log a new trade in the user's trade journal (separate from the watchlist). Use this when the user says " +
      "things like 'I bought 10 AAPL at 150' or 'log a short on TSLA'. buy_date and sell_date default to today " +
      "if not mentioned.",
    inputSchema: z.object({
      symbol: z.string().describe("Stock ticker, e.g. AAPL"),
      direction: z.enum(["long", "short"]).default("long"),
      quantity: z.number().positive().default(1).describe("Position size (number of shares)"),
      buy_price: z.number().positive().describe("Entry price per share"),
      buy_date: z.string().optional().describe("Entry date as YYYY-MM-DD; defaults to today if omitted"),
      sell_price: z.number().positive().nullable().optional().describe("Exit price per share, if already closed"),
      sell_date: z.string().nullable().optional().describe("Exit date as YYYY-MM-DD; defaults to today if sell_price is given but this isn't"),
      notes: z.string().nullable().optional(),
    }),
    run: async ({ symbol, direction, quantity, buy_price, buy_date, sell_price, sell_date, notes }) => {
      const trade = await addTrade(userId, {
        symbol,
        direction,
        quantity,
        buyPrice: buy_price,
        buyDate: buy_date ?? todayIso(),
        sellPrice: sell_price ?? null,
        sellDate: sell_price != null ? sell_date ?? todayIso() : null,
        notes: notes ?? null,
      });
      return `Logged: ${formatTrade(trade)}`;
    },
  });

  const listTradesTool = betaZodTool({
    name: "list_trades",
    description: "List every trade in the user's trade journal, most recent first.",
    inputSchema: z.object({}),
    run: async () => {
      const trades = await listTrades(userId);
      return trades.length > 0 ? trades.map(formatTrade).join("\n") : "No trades logged yet.";
    },
  });

  const closeTradeTool = betaZodTool({
    name: "close_trade",
    description:
      "Close (add a sell price/date to) an existing open trade for a symbol — e.g. 'I sold my AAPL at 180'. " +
      "Only works on trades that don't already have a sell price. sell_date defaults to today if omitted.",
    inputSchema: z.object({
      symbol: z.string().describe("Stock ticker of the open trade to close"),
      sell_price: z.number().positive(),
      sell_date: z.string().optional().describe("Exit date as YYYY-MM-DD; defaults to today"),
    }),
    run: async ({ symbol, sell_price, sell_date }) => {
      const open = await findOpenTradesBySymbol(userId, symbol);
      if (open.length === 0) return `No open trade found for ${symbol.toUpperCase()}.`;
      if (open.length > 1) {
        return (
          `There are ${open.length} open trades for ${symbol.toUpperCase()}, so I don't know which to close:\n` +
          open.map(formatTrade).join("\n") +
          "\nAsk me to remove or close by a more specific detail, or use the web app to pick one."
        );
      }

      await updateTrade(userId, open[0].id, { sellPrice: sell_price, sellDate: sell_date ?? todayIso() });
      const [updated] = await findTradesBySymbol(userId, symbol, open[0].buyDate);
      return `Closed: ${formatTrade(updated ?? open[0])}`;
    },
  });

  const removeTradeTool = betaZodTool({
    name: "remove_trade",
    description:
      "Delete a trade from the trade journal entirely (not the same as closing it). If more than one trade " +
      "matches the symbol, also pass buy_date to disambiguate.",
    inputSchema: z.object({
      symbol: z.string(),
      buy_date: z.string().nullable().optional().describe("YYYY-MM-DD, to disambiguate if multiple trades match"),
    }),
    run: async ({ symbol, buy_date }) => {
      const matches = await findTradesBySymbol(userId, symbol, buy_date ?? undefined);
      if (matches.length === 0) return `No trade found for ${symbol.toUpperCase()}${buy_date ? ` on ${buy_date}` : ""}.`;
      if (matches.length > 1) {
        return (
          `There are ${matches.length} trades matching ${symbol.toUpperCase()}, so I don't know which to remove:\n` +
          matches.map(formatTrade).join("\n") +
          "\nTell me the buy date to pick one."
        );
      }

      await deleteTrade(userId, matches[0].id);
      return `Removed: ${formatTrade(matches[0])}`;
    },
  });

  return [
    addStock,
    removeStock,
    listWatchlist,
    screenWatchlist,
    addTradeTool,
    listTradesTool,
    closeTradeTool,
    removeTradeTool,
  ];
}

const SYSTEM_PROMPT =
  "You are the Stock Scout Telegram assistant. The user manages their stock watchlist, screens it for " +
  "moving-average/Fibonacci setups, and logs trades in their trade journal — all by chatting with you in " +
  "plain English. Use the available tools to actually perform actions — never claim to have done something " +
  "without calling the matching tool. The watchlist and the trade journal are separate things: 'add AAPL' " +
  "means the watchlist; 'I bought AAPL at 150' or 'log a trade' means the trade journal. When the user " +
  "names a category or theme instead of exact tickers (e.g. \"add 20 tech stocks\", \"add some EV makers\"), " +
  "pick specific real, well-known ticker symbols yourself from your own knowledge — don't ask the user to " +
  "list them. Always pass every symbol for a watchlist add/remove request in a single tool call, not one call " +
  "per symbol. Keep replies short and mobile-friendly: plain text, no markdown tables, no headers.";

export async function runAgent(userId: string, message: string): Promise<string> {
  const anthropic = getClient();

  const finalMessage = await anthropic.beta.messages.toolRunner(
    {
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      max_iterations: AGENT_MAX_ITERATIONS,
      system: SYSTEM_PROMPT,
      tools: buildTools(userId),
      messages: [{ role: "user", content: message }],
    },
    { signal: AbortSignal.timeout(AGENT_TIMEOUT_MS) }
  );

  return finalMessage.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim() || "OK.";
}
