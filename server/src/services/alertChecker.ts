import { checkAlerts } from "./alerts";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Periodically checks every active price/moving-average alert. Runs
 * indefinitely on a plain interval (same "personal-scale, single process"
 * shape as telegramBot.ts's poll loop) — one failed tick logs and waits for
 * the next rather than taking the whole checker down.
 */
export function startAlertChecker(): void {
  const intervalMs = Number(process.env.ALERT_CHECK_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  console.log(`Alert checker started (every ${Math.round(intervalMs / 60_000)} min).`);

  setInterval(() => {
    checkAlerts().catch((err) => console.error("Alert check failed:", err));
  }, intervalMs);
}
