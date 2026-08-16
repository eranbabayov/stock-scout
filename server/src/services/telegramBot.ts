import { getTelegramUpdates, sendTelegramMessage } from "../lib/telegram";
import { handleIncomingMessage } from "./telegramConversation";
import { ConcurrencyLimiter } from "../lib/concurrencyLimiter";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bounds how many chats can be mid-processing at once, process-wide. Per-chat
// ordering (below) already prevents one chat from racing itself; this caps
// total cross-chat parallelism so a burst of many simultaneous new
// conversations can't fire unbounded concurrent Claude API calls, DB writes,
// and Yahoo Finance fetches all at the same time.
const processingLimiter = new ConcurrencyLimiter(Number(process.env.TELEGRAM_CONCURRENCY ?? 10));

// Chains each chat's messages onto its own promise, so a slow request from
// one user (a big batch add, a slow Yahoo/Claude call) can't delay replies
// to any other chat — different chats process fully in parallel. Messages
// within the *same* chat still process one at a time and in order, which
// also avoids races like two concurrent "add stock" calls double-inserting.
const chatQueues = new Map<string, Promise<void>>();

function enqueueForChat(chatId: string, task: () => Promise<void>): void {
  const previous = chatQueues.get(chatId) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Once this chat's queue drains back to empty, drop it instead of holding
  // an ever-growing map of resolved promises for every chat that ever wrote in.
  chatQueues.set(
    chatId,
    next.finally(() => {
      if (chatQueues.get(chatId) === next) chatQueues.delete(chatId);
    })
  );
}

async function processMessage(chatId: number, text: string): Promise<void> {
  await processingLimiter.run(async () => {
    try {
      const reply = await handleIncomingMessage(String(chatId), text);
      await sendTelegramMessage(chatId, reply);
    } catch (err) {
      console.error("Telegram message handling failed:", err);
      await sendTelegramMessage(chatId, "Sorry, something went wrong on my end. Please try again.").catch(
        () => undefined
      );
    }
  });
}

/**
 * Long-polls Telegram for new messages instead of running a public webhook —
 * no tunnel or public URL needed. Runs until the process exits; on any error
 * (network blip, Telegram hiccup) it backs off briefly and keeps polling.
 */
export async function startTelegramBot(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.");
    return;
  }

  console.log("Telegram bot polling started.");
  let offset = 0;

  while (true) {
    let updates;
    try {
      updates = await getTelegramUpdates(offset);
    } catch (err) {
      console.error("Telegram polling error:", err);
      await sleep(5000);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;

      const chatId = update.message?.chat.id;
      const text = update.message?.text;
      if (chatId == null || !text) continue;

      enqueueForChat(String(chatId), () => processMessage(chatId, text));
    }
  }
}
