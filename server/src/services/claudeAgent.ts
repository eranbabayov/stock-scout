import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { userStocks } from "../db/schema";
import { fetchStockData, type StockRow } from "./yahooFinance";
import { addStockToWatchlist, removeStockFromWatchlist, MAX_BATCH_SIZE } from "./watchlist";
import {
  getOrCreateDefaultListId,
  resolveOrCreateListByName,
  findListByName,
  listLists as listWatchlistListsService,
  createList as createWatchlistList,
} from "./watchlistLists";
import {
  addTrade,
  listTrades,
  findOpenTradesBySymbol,
  findTradesBySymbol,
  updateTrade,
  deleteTrade,
} from "./trades";
import { getPlaybookRules, addPlaybookRule } from "./agentPlaybook";
import { createPriceAlert, createMovingAverageAlert, listAlerts, deleteAlert, findActiveAlertsBySymbol } from "./alerts";
import type { UserTrade, StockAlert } from "../db/schema";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  FIB_LEVELS,
  checkStocksCombined,
} from "../../../shared/screener";

const AGENT_MAX_ITERATIONS = 10;
const AGENT_TIMEOUT_MS = 60_000;

// Routine requests stay on the cheap/fast model; only ones it explicitly
// escalates go to the stronger (and more expensive) one.
const WEAK_MODEL = "claude-haiku-4-5";
const STRONG_MODEL = "claude-sonnet-5";

// Sentinel the weak model is instructed to reply with, verbatim and with no
// tool calls, when a request is too complex/ambiguous for it even with the
// playbook. Detected via exact match, never shown to the user.
const ESCALATE = "ESCALATE";

// Sentinel either model replies with, verbatim and with no tool calls, when
// the chat is in read-only mode (see `mode` below) and the request needs a
// write tool that simply isn't in its tool list. Re-exported as a distinct
// constant so telegramConversation.ts can detect it without depending on the
// literal model output string itself.
const NEEDS_REVERIFICATION_SENTINEL = "NEEDS_REVERIFICATION";
export const NEEDS_REVERIFICATION = "__NEEDS_REVERIFICATION__";

export type AgentMode = "full" | "readonly";

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

function formatAlert(alert: StockAlert): string {
  const condition =
    alert.kind === "price"
      ? `hits $${alert.targetPrice}`
      : `crosses ${alert.direction} its ${alert.indicatorPeriod}-day ${alert.indicatorType}`;
  const status = alert.status === "triggered" ? ` — triggered ${alert.triggeredAt?.toISOString().split("T")[0]}` : "";
  return `${alert.symbol}: alert when it ${condition}${status}`;
}

// betaZodTool's return type is generic per input schema (BetaRunnableTool<Shape>),
// so an array mixing several distinct tools needs a common element type — the
// SDK's own toolRunner `tools` param uses BetaRunnableTool<any> for exactly
// this reason, and there's no narrower type that's both public and accurate
// for a heterogeneous tool list. Each tool's own `run` is still fully typed
// against its own inputSchema at its definition site above; only this
// aggregation step loses precision.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgentTool = ReturnType<typeof betaZodTool<z.ZodType<any>>>;

function buildTools(userId: string, mode: AgentMode, includePlaybookTool: boolean): AnyAgentTool[] {
  const addStock = betaZodTool({
    name: "add_stocks_to_watchlist",
    description:
      `Add one or more stock symbols to the user's watchlist in a single call (max ${MAX_BATCH_SIZE} per call, ` +
      "and the watchlist itself has a size limit). Validates each symbol is a real, tradeable ticker first. " +
      "The user can organize stocks into separate named lists (e.g. \"SOXX\", \"Tech stocks\") — pass list_name " +
      "to target one; it's created automatically if it doesn't exist yet. Omit list_name to use the default " +
      "watchlist. Pass every symbol the user wants added at once — don't call this tool once per symbol.",
    inputSchema: z.object({
      symbols: z
        .array(z.string())
        .min(1)
        .describe("Stock tickers to add, e.g. [\"AAPL\", \"MSFT\", \"NVDA\"]"),
      list_name: z
        .string()
        .nullable()
        .optional()
        .describe("Name of the list to add to, e.g. \"SOXX\". Created automatically if new. Omit for the default watchlist."),
    }),
    run: async ({ symbols, list_name }) => {
      if (symbols.length > MAX_BATCH_SIZE) {
        return (
          `That's ${symbols.length} symbols, but I can only process ${MAX_BATCH_SIZE} at a time. ` +
          "Please ask again with a smaller batch."
        );
      }

      let listId: string;
      if (list_name) {
        const resolved = await resolveOrCreateListByName(userId, list_name);
        if (!resolved.ok) {
          return resolved.reason === "limit_reached"
            ? "You've reached the maximum number of lists — remove one first."
            : "That list name isn't valid.";
        }
        listId = resolved.list.id;
      } else {
        listId = await getOrCreateDefaultListId(userId);
      }

      const results: string[] = [];
      for (const raw of symbols) {
        const upperSymbol = raw.toUpperCase();
        const outcome = await addStockToWatchlist(userId, upperSymbol, listId);
        const label =
          outcome === "added"
            ? "added"
            : outcome === "duplicate"
            ? "already on that list"
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
      "call). Pass list_name to remove from a specific named list instead of the default watchlist. Pass every " +
      "symbol the user wants removed at once — don't call this tool once per symbol.",
    inputSchema: z.object({
      symbols: z.array(z.string()).min(1).describe("Stock tickers to remove, e.g. [\"AAPL\", \"MSFT\"]"),
      list_name: z.string().nullable().optional().describe("Name of the list to remove from. Omit for the default watchlist."),
    }),
    run: async ({ symbols, list_name }) => {
      if (symbols.length > MAX_BATCH_SIZE) {
        return (
          `That's ${symbols.length} symbols, but I can only process ${MAX_BATCH_SIZE} at a time. ` +
          "Please ask again with a smaller batch."
        );
      }

      let listId: string;
      if (list_name) {
        const list = await findListByName(userId, list_name);
        if (!list) return `No list named "${list_name}" — check list_watchlist_lists for the exact name.`;
        listId = list.id;
      } else {
        listId = await getOrCreateDefaultListId(userId);
      }

      const results: string[] = [];
      for (const raw of symbols) {
        const upperSymbol = raw.toUpperCase();
        const outcome = await removeStockFromWatchlist(userId, upperSymbol, listId);
        results.push(`${upperSymbol}: ${outcome === "removed" ? "removed" : "wasn't on that list"}`);
      }

      return results.join("\n");
    },
  });

  const listWatchlist = betaZodTool({
    name: "list_watchlist",
    description: "List every stock symbol currently on the user's watchlist, across all their lists combined.",
    inputSchema: z.object({}),
    run: async () => {
      const symbols = await getWatchlistSymbols(userId);
      return symbols.length > 0 ? symbols.join(", ") : "The watchlist is empty.";
    },
  });

  const listWatchlistLists = betaZodTool({
    name: "list_watchlist_lists",
    description:
      "List the user's named watchlist lists (e.g. \"SOXX\", \"Tech stocks\") and which symbols are in each one.",
    inputSchema: z.object({}),
    run: async () => {
      const lists = await listWatchlistListsService(userId);
      if (lists.length === 0) return "No lists yet.";
      return lists
        .map((l) => `${l.name}${l.isDefault ? " (default)" : ""}: ${l.symbols.length > 0 ? l.symbols.join(", ") : "empty"}`)
        .join("\n");
    },
  });

  const createWatchlistListTool = betaZodTool({
    name: "create_watchlist_list",
    description:
      "Create a new named watchlist list (e.g. \"SOXX\", \"Tech stocks\") with no stocks in it yet. Not needed " +
      "before add_stocks_to_watchlist — that creates the list automatically if list_name is new. Use this when " +
      "the user just wants an empty list created.",
    inputSchema: z.object({
      name: z.string().describe("Name for the new list"),
    }),
    run: async ({ name }) => {
      const result = await createWatchlistList(userId, name);
      if (!result.ok) {
        return result.reason === "limit_reached"
          ? "You've reached the maximum number of lists — remove one first."
          : "A list name is required.";
      }
      return `Created list "${result.list.name}".`;
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

  const createPriceAlertTool = betaZodTool({
    name: "create_price_alert",
    description:
      "Create a one-shot alert that emails the user once a stock reaches a specific target price. Which " +
      "direction (rising to it or falling to it) is figured out automatically from the current price — just " +
      "give the target. The alert fires once, then stops (create a new one to keep watching that level).",
    inputSchema: z.object({
      symbol: z.string().describe("Stock ticker, e.g. AAPL"),
      target_price: z.number().positive(),
    }),
    run: async ({ symbol, target_price }) => {
      const result = await createPriceAlert(userId, symbol, target_price);
      if (!result.ok) {
        const messages: Record<string, string> = {
          invalid_symbol: `"${symbol}" doesn't look like a valid stock symbol.`,
          limit_reached: "You've reached the maximum number of active alerts — remove one first.",
          no_price_data: `Couldn't fetch current price data for ${symbol.toUpperCase()} right now.`,
        };
        return messages[result.reason] ?? "Couldn't create that alert.";
      }
      return `Alert set: ${formatAlert(result.alert)}`;
    },
  });

  const createMaAlertTool = betaZodTool({
    name: "create_ma_alert",
    description:
      "Create a one-shot alert that emails the user once a stock's price crosses one of its moving averages " +
      "(e.g. 'alert me when TSLA crosses its 50-day EMA'). Which direction counts as a cross is figured out " +
      "automatically from the current price/MA relationship. Fires once, then stops.",
    inputSchema: z.object({
      symbol: z.string().describe("Stock ticker, e.g. TSLA"),
      indicator_type: z.enum(["EMA", "SMA"]),
      indicator_period: z.number().int().positive().describe("e.g. 50 for a 50-day average"),
    }),
    run: async ({ symbol, indicator_type, indicator_period }) => {
      const result = await createMovingAverageAlert(userId, symbol, indicator_type, indicator_period);
      if (!result.ok) {
        const messages: Record<string, string> = {
          invalid_symbol: `"${symbol}" doesn't look like a valid stock symbol.`,
          limit_reached: "You've reached the maximum number of active alerts — remove one first.",
          no_price_data: `Couldn't fetch enough price history for ${symbol.toUpperCase()} to compute that average right now.`,
        };
        return messages[result.reason] ?? "Couldn't create that alert.";
      }
      return `Alert set: ${formatAlert(result.alert)}`;
    },
  });

  const listAlertsTool = betaZodTool({
    name: "list_alerts",
    description: "List every price/moving-average alert the user has set, including already-triggered ones.",
    inputSchema: z.object({}),
    run: async () => {
      const alerts = await listAlerts(userId);
      return alerts.length > 0 ? alerts.map(formatAlert).join("\n") : "No alerts set.";
    },
  });

  const cancelAlertTool = betaZodTool({
    name: "cancel_alert",
    description:
      "Cancel an active (not yet triggered) alert for a symbol. If more than one active alert matches the " +
      "symbol, lists them so the user can clarify which one.",
    inputSchema: z.object({
      symbol: z.string(),
    }),
    run: async ({ symbol }) => {
      const matches = await findActiveAlertsBySymbol(userId, symbol);
      if (matches.length === 0) return `No active alert found for ${symbol.toUpperCase()}.`;
      if (matches.length > 1) {
        return (
          `There are ${matches.length} active alerts for ${symbol.toUpperCase()}:\n` +
          matches.map(formatAlert).join("\n") +
          "\nUse the web app to cancel a specific one."
        );
      }

      await deleteAlert(userId, matches[0].id);
      return `Cancelled: ${formatAlert(matches[0])}`;
    },
  });

  const recordPlaybookRule = betaZodTool({
    name: "record_playbook_rule",
    description:
      "Save a short, generalized rule describing how to handle this TYPE of request, so a cheaper/faster " +
      "assistant can handle similar future requests itself instead of escalating. Call this once, after you've " +
      "finished handling the user's request — but only if the pattern is likely to recur; skip it for a genuine " +
      "one-off. Keep it generic: describe the pattern and procedure, not this specific user's exact numbers or " +
      "tickers.",
    inputSchema: z.object({
      trigger_summary: z.string().describe("Short description of the kind of request this rule applies to"),
      rule_text: z.string().describe("The generalized guidance/procedure to follow for that kind of request"),
    }),
    run: async ({ trigger_summary, rule_text }) => {
      await addPlaybookRule(trigger_summary, rule_text);
      return "Saved to the playbook.";
    },
  });

  // Write tools are structurally absent from the request in readonly mode —
  // not just discouraged by the prompt — so the model literally cannot call
  // them regardless of how it interprets the instructions.
  const readOnlyTools: AnyAgentTool[] = [listWatchlist, listWatchlistLists, screenWatchlist, listTradesTool, listAlertsTool];
  const writeTools: AnyAgentTool[] = [
    addStock,
    removeStock,
    createWatchlistListTool,
    addTradeTool,
    closeTradeTool,
    removeTradeTool,
    createPriceAlertTool,
    createMaAlertTool,
    cancelAlertTool,
  ];
  const tools = mode === "full" ? [...readOnlyTools, ...writeTools] : readOnlyTools;
  if (includePlaybookTool) tools.push(recordPlaybookRule);
  return tools;
}

const SYSTEM_PROMPT =
  "You are the Stock Scout Telegram assistant. The user manages their stock watchlist, screens it for " +
  "moving-average/Fibonacci setups, logs trades in their trade journal, and sets price/moving-average alerts " +
  "— all by chatting with you in plain English. Use the available tools to actually perform actions — never " +
  "claim to have done something without calling the matching tool. The watchlist, the trade journal, and " +
  "alerts are three separate things: 'add AAPL' means the watchlist; 'I bought AAPL at 150' or 'log a trade' " +
  "means the trade journal; 'alert me when AAPL hits 200' or 'tell me if TSLA crosses its 50-day EMA' means " +
  "an alert. Alerts are one-shot — they email the user once, then stop; mention that when confirming one. " +
  "The watchlist can be organized into separate named lists (e.g. \"SOXX\", \"Tech stocks\") — you DO support " +
  "this. 'create a list called X', 'add AAPL to my Tech list', 'what's in my SOXX list' all work: pass " +
  "list_name to add_stocks_to_watchlist/remove_stocks_from_watchlist (it's created automatically if new), or " +
  "use create_watchlist_list / list_watchlist_lists directly. Never tell the user this isn't supported. " +
  "When the user names a category or theme instead of exact tickers (e.g. \"add 20 tech stocks\", \"add some " +
  "EV makers\"), pick specific real, well-known ticker symbols yourself from your own knowledge — don't ask " +
  "the user to list them. Always pass every symbol for a watchlist add/remove request in a single tool call, " +
  "not one call per symbol. Keep replies short and mobile-friendly: plain text, no markdown tables, no headers.";

function extractText(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function isSentinel(text: string, sentinel: string): boolean {
  return text.toLowerCase() === sentinel.toLowerCase();
}

async function runOnce(
  model: string,
  system: string,
  tools: ReturnType<typeof buildTools>,
  message: string
): Promise<string> {
  const anthropic = getClient();
  const result = await anthropic.beta.messages.toolRunner(
    {
      model,
      max_tokens: 4096,
      max_iterations: AGENT_MAX_ITERATIONS,
      system,
      tools,
      messages: [{ role: "user", content: message }],
    },
    { signal: AbortSignal.timeout(AGENT_TIMEOUT_MS) }
  );
  return extractText(result);
}

/**
 * Runs the user's message through the cheap model first; escalates to the
 * strong model only if the cheap model can't confidently handle it (even
 * with the playbook). `mode` is orthogonal to that routing — "readonly"
 * strips write tools from *both* tiers and asks whichever model runs to flag
 * write attempts instead of quietly failing, so the caller can trigger
 * step-up re-verification (see telegramConversation.ts).
 */
export async function runAgent(userId: string, message: string, mode: AgentMode = "full"): Promise<string> {
  const playbook = await getPlaybookRules();
  const playbookSection =
    playbook.length > 0
      ? "\n\nPLAYBOOK (rules learned from harder past requests — apply them directly when relevant instead of " +
        "re-deriving from scratch):\n" +
        playbook.map((r) => `- ${r.triggerSummary}: ${r.ruleText}`).join("\n")
      : "";

  const modeNote =
    mode === "readonly"
      ? "\n\nIMPORTANT: This chat session has been idle and is currently READ-ONLY — the tools that add, remove, " +
        "or modify anything are not available to you right now. If the user's request needs one of those " +
        `actions, don't explain or apologize — reply with EXACTLY "${NEEDS_REVERIFICATION_SENTINEL}" and nothing ` +
        "else, and call no tools. Otherwise, answer normally with the read-only tools you do have."
      : "";

  const escalateNote =
    "\n\nIf this request is too complex, ambiguous, or unusual for you to confidently handle — even with the " +
    `playbook above — reply with EXACTLY "${ESCALATE}" as your ENTIRE reply, before calling any tools, and a ` +
    "more capable assistant will take over.";

  const baseSystem = SYSTEM_PROMPT + playbookSection + modeNote + escalateNote;
  const weakTools = buildTools(userId, mode, false);

  let text = await runOnce(WEAK_MODEL, baseSystem, weakTools, message);

  if (mode === "readonly" && isSentinel(text, NEEDS_REVERIFICATION_SENTINEL)) {
    return NEEDS_REVERIFICATION;
  }

  if (isSentinel(text, ESCALATE)) {
    const strongSystem =
      SYSTEM_PROMPT +
      playbookSection +
      modeNote +
      "\n\nA cheaper assistant escalated this request to you because it's complex. After fully handling it with " +
      "the tools available, call record_playbook_rule ONCE to save a short, generalized rule so the cheaper " +
      "assistant can handle similar requests itself next time — skip this only if the request was a genuine " +
      "one-off unlikely to recur.";
    const strongTools = buildTools(userId, mode, true);
    text = await runOnce(STRONG_MODEL, strongSystem, strongTools, message);

    if (mode === "readonly" && isSentinel(text, NEEDS_REVERIFICATION_SENTINEL)) {
      return NEEDS_REVERIFICATION;
    }
  }

  return text || "OK.";
}
