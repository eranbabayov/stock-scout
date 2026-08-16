# Stock Scout — architecture reference

Read this before implementing anything here — it maps the codebase so you don't have to re-derive it from scratch each session. Keep it in sync when the architecture changes; it's a map, not prose — update it, don't let it rot.

## What this is

A personal stock watchlist/screening/trade-journal/price-alerting app with an optional Telegram assistant. Single-node deployment (no horizontal scaling) — see "Deployment" below and the README's "Scaling notes".

## Directory map

- `src/` — React 18 + Vite frontend (shadcn/ui, TanStack Query, React Router `BrowserRouter`).
- `server/src/` — Express + Drizzle ORM + Postgres backend.
- `shared/screener.ts` — framework-free EMA/SMA/Fibonacci math, imported by **both** `src/lib/stockApi.ts` (frontend charts/screener UI) and `server/src/services/claudeAgent.ts` (`screen_watchlist` tool). Change the math once here, not twice.
- `server/drizzle/` — SQL migrations, generated via `npm run db:generate` from `server/src/db/schema.ts`, applied via `npm run db:migrate`.

## Request flow (web)

`src/lib/apiClient.ts` (fetch wrapper, `credentials: "include"`, base `VITE_API_URL` default `/api`) → Express routes in `server/src/routes/*.routes.ts` → **service functions** in `server/src/services/*.ts` → Drizzle (`server/src/db/schema.ts`) → Postgres.

Auth: JWT in an httpOnly cookie (`server/src/lib/jwt.ts`, `cookies.ts`), `requireAuth` middleware (`server/src/middleware/auth.ts`) gates protected routes.

## Request flow (Telegram)

`server/src/services/telegramBot.ts` long-polls Telegram (no webhook/tunnel) → per-chat serialized / cross-chat parallel queue → `telegramConversation.ts` (auth + session state machine) → `claudeAgent.ts` (tiered LLM agent with tools) → **the same service functions the REST routes use** (`watchlist.ts`, `trades.ts`, `yahooFinance.ts`) — this is the core DRY pattern: a capability is built once as a service function, then both the REST route and the Telegram tool call it.

### Telegram auth/session state machine (`telegramConversation.ts`)

Per `telegram_links` row (one per linked chat):
- **Not linked**: user sends their email → OTP emailed (`telegram_otp_codes`, `lib/email.ts`) → correct code creates the link.
- **Linked, `linkedAt` > 7 days ago**: link is deleted outright, falls back to the "not linked" flow (full re-verification from scratch — mirrors the web JWT's `JWT_EXPIRES_IN=7d`).
- **Linked, active within 10 min (`lastActiveAt`)**: full read/write access.
- **Linked, idle > 10 min**: `runAgent(..., "readonly")` — write tools are structurally absent from that call's tool list (not just prompt-discouraged). If the model determines the request needed a write, it returns the `NEEDS_REVERIFICATION` sentinel; the conversation layer emails a fresh OTP, stores the original message as `pendingActionText` on the link, and asks the user to confirm. Replying with the correct code re-runs `pendingActionText` with full write access and clears the pending state. Any message (read or write) refreshes `lastActiveAt` — the countdown is about chat activity, not specifically about writes.

### Tiered model + playbook (`claudeAgent.ts`)

Every request first goes to `WEAK_MODEL` (`claude-haiku-4-5`) with the current playbook (`agent_playbook` table, most recent 30 rows) injected into its system prompt as plain-text rules. If it can't confidently handle the request (even with the playbook), it replies with the `ESCALATE` sentinel instead of guessing, and `STRONG_MODEL` (`claude-sonnet-5`) takes over with the same context plus a `record_playbook_rule` tool — call it once, after finishing, with a *generalized* rule (not this user's specific numbers) so the weak model can handle similar requests itself next time. `mode` (full/readonly) and model-tier routing are orthogonal — either tier can hit either sentinel.

## Key shared services (`server/src/services/`)

- `watchlist.ts` — add/remove, always scoped to a `watchlist_lists` list id, enforces `MAX_WATCHLIST_SIZE`/`MAX_BATCH_SIZE`, unique-violation (`23505`) races collapse to `"duplicate"` instead of throwing. `user_stocks` is the canonical "this user tracks this symbol somewhere" record (still what price-fetching and the cap key off); `watchlist_list_items` is a separate many-to-many membership table — a symbol can be in more than one list. `removeStockFromWatchlist` deletes just the one list's membership, then calls `cleanupOrphanedStock` to also drop the `user_stocks` row once a symbol is in zero lists (also called by `watchlistLists.ts`'s `deleteList` for every symbol that was only in the deleted list).
- `watchlistLists.ts` — list CRUD (`MAX_WATCHLIST_LISTS` cap), plus `getOrCreateDefaultListId` — every user has exactly one `isDefault` list, which is what the Telegram watchlist tools target (chat doesn't expose the list concept) and where a fresh user's first list lands automatically.
- `trades.ts` — trade journal CRUD, used by `trades.routes.ts` and the Telegram trade tools.
- `yahooFinance.ts` — unauthenticated Yahoo Finance chart API, cached in Postgres (`stock_cache`). Gated through a shared `ConcurrencyLimiter` (`lib/concurrencyLimiter.ts`, env `YAHOO_CONCURRENCY`) plus an in-flight request map so concurrent requests for the same uncached symbol collapse into one upstream call. `fetchStockData` fans out per-symbol requests via `Promise.all` (bounded by the limiter, not by a sequential loop).
- `agentPlaybook.ts` — read/write for the learned-rules table above.
- `telegramBot.ts` — also uses `ConcurrencyLimiter` (env `TELEGRAM_CONCURRENCY`) to bound total cross-chat concurrent processing, independent of Yahoo's limiter.
- `alerts.ts` — price/moving-average alerts (`stock_alerts` table), used by `alerts.routes.ts` and the Telegram alert tools. One-shot: `direction` ("above"/"below") is computed once at creation from the current price/MA relationship, and `checkAlerts()` fires the moment the live relationship matches it, then flips `status` to `"triggered"` — it never re-fires. `checkAlerts()` dedupes by symbol before fetching (one Yahoo call per symbol regardless of how many alerts, across however many users, reference it) and is driven by `alertChecker.ts`'s `setInterval` loop (env `ALERT_CHECK_INTERVAL_MS`, default 15 min), started from `index.ts` alongside the Telegram poller. Comparison price is always live (`yahooFinance.ts`'s `getCurrentPrice`, reading the chart endpoint's `meta.regularMarketPrice`); a moving average's *value* still comes from completed daily bars, same as everywhere else.

`db/index.ts`'s `pg.Pool` has an `'error'` listener — without it, a transient connection error is an uncaught exception that kills the whole process. Don't remove it.

## Deployment

Three containers, one `Dockerfile` with two targets:
- `nginx` (`--target frontend`) — serves the Vite build, reverse-proxies `/api/*` to `backend`, immutable cache headers on hashed assets, SPA fallback to `index.html`. Only this is published to the host.
- `backend` (`--target backend`) — Express API + Telegram bot, internal-only (`expose`, no `ports`). Runs its TypeScript directly via `tsx` (same as dev) — no separate compile step. `docker-entrypoint.sh` applies pending migrations before starting.
- `postgres`.

`docker-compose.prod.yml` has an explicit `name: stock-scout-prod` — without it, Compose derives the project name from the directory and collides with dev's `docker-compose.yml` (same "postgres" service key, different container). Don't remove that `name:` field.

CI (`.github/workflows/ci.yml`): typecheck × 3 (`tsconfig.app.json`, `server/tsconfig.json`, `tsconfig.node.json`) + lint + test + build, on every push/PR to `main`. CD (`docker-publish.yml`): matrix build over `[backend, frontend]`, pushes to GHCR, gated on CI passing on `main` (via `workflow_run`).

## Conventions to follow

- New capability touching both web and Telegram → one service function in `server/src/services/`, called from both the REST route and the agent tool. Don't duplicate logic.
- New external-service call path that could see concurrent load → gate it through `ConcurrencyLimiter`, don't fire unbounded concurrent requests.
- Server code runs via `tsx` (no compile step) in both dev and prod — don't introduce a `tsc`-to-JS build step for the server without also updating the Dockerfile's backend target.
- Migrations: edit `server/src/db/schema.ts`, then `npm run db:generate` + `npm run db:migrate` — never hand-write SQL migrations.
