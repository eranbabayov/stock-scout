const SEND_TIMEOUT_MS = 10_000;
// getUpdates uses Telegram's own server-side long-poll wait (`timeout` query
// param below); the client-side cap just needs enough headroom above that to
// never fire under normal conditions, only if Telegram itself hangs.
const POLL_WAIT_SECONDS = 30;
const POLL_TIMEOUT_MS = (POLL_WAIT_SECONDS + 10) * 1000;

function apiBase(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN must be set to use the Telegram bot");
  }
  return `https://api.telegram.org/bot${token}`;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`${apiBase()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram send failed (${res.status}): ${body}`);
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

export async function getTelegramUpdates(offset: number): Promise<TelegramUpdate[]> {
  const res = await fetch(`${apiBase()}/getUpdates?timeout=${POLL_WAIT_SECONDS}&offset=${offset}`, {
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram getUpdates failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram getUpdates error: ${data.description ?? "unknown error"}`);
  }

  return data.result ?? [];
}
