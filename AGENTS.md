<!-- bmad:context -->
<!-- Verified 2026-08-22 against 56a819c. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## stock-scout

Personal stock watchlist/screening/trade-journal/price-alerting app with an optional Telegram assistant. React 18 + Vite frontend, Express + Drizzle ORM + Postgres backend. Single-node deployment (no horizontal scaling) — see README's "Scaling notes".

## Where things are

- `shared/screener.ts` — framework-free EMA/SMA/Fibonacci math, imported by both `src/lib/stockApi.ts` (frontend charts/screener UI) and `server/src/services/claudeAgent.ts` (`screen_watchlist` tool). Change the math once here, not twice.
- Web request flow: `src/lib/apiClient.ts` → `server/src/routes/*.routes.ts` → `server/src/services/*.ts` → Drizzle (`server/src/db/schema.ts`) → Postgres. Auth is a JWT in an httpOnly cookie, gated by `middleware/auth.ts`'s `requireAuth`.
- Telegram request flow: `telegramBot.ts` long-polls Telegram (no webhook/tunnel needed) → `telegramConversation.ts` (auth + session state machine) → `claudeAgent.ts` (tiered LLM agent with tools) → the same service functions the REST routes use.
- Key services (`server/src/services/`):
  - `watchlist.ts` — add/remove, scoped to a `watchlist_lists` list id, enforces `MAX_WATCHLIST_SIZE`/`MAX_BATCH_SIZE` (premium users bypass the size cap). `user_stocks` is the canonical "user tracks this symbol" record; `watchlist_list_items` is a separate many-to-many membership table. Removing from a list only drops that membership — `cleanupOrphanedStock` drops `user_stocks` once a symbol is in zero lists.
  - `watchlistLists.ts` — list CRUD, `getOrCreateDefaultListId` (every user has one `isDefault` list; Telegram targets it since chat has no list concept).
  - `trades.ts` — trade journal CRUD.
  - `yahooFinance.ts` — unauthenticated Yahoo chart API, cached in Postgres. Gated through `ConcurrencyLimiter` plus an in-flight request map, so concurrent requests for the same uncached symbol collapse into one upstream call. `fetchStockData` fans out per-symbol via `Promise.all`.
  - `agentPlaybook.ts` — read/write for the Telegram agent's learned-rules table.
  - `telegramBot.ts` — its own `ConcurrencyLimiter` bounds total cross-chat concurrent processing, independent of Yahoo's.
  - `alerts.ts` — price/moving-average alerts. One-shot: `direction` is computed once at creation and never re-evaluated; `checkAlerts()` dedupes by symbol before fetching (one Yahoo call per symbol regardless of how many alerts/users reference it), driven by `alertChecker.ts`'s interval loop.
  - `chartDrawings.ts` — user-drawn trendlines/rays/horizontal lines, anchored by each point's actual bar date. Web-only — not exposed to the Telegram agent.
- Chart drawing UI: `src/components/StockChart.tsx` + `chartDrawings.ts`.
- Deployment topology: three containers (`nginx`, `backend`, `postgres`), one `Dockerfile` with two targets (`--target frontend` / `--target backend`) so there's no duplicated build logic. Only `nginx` is published to the host.

## Conventions that differ from defaults

- New capability touching both web and Telegram → one service function in `server/src/services/`, called from both the REST route and the agent tool. Don't duplicate logic.
- New external-service call path that could see concurrent load → gate it through `ConcurrencyLimiter` (`lib/concurrencyLimiter.ts`). Don't fire unbounded concurrent requests.
- Server code runs via `tsx` directly (no compile step) in both dev and prod. Don't introduce a `tsc`-to-JS build step for the server without also updating the Dockerfile's `backend` target.
- Migrations: edit `server/src/db/schema.ts`, then `npm run db:generate` + `npm run db:migrate`. Never hand-write SQL migrations.
- Telegram link lifecycle (`telegramConversation.ts`), per `telegram_links` row: not linked → email → emailed OTP → linked. Link older than its expiry (mirrors `JWT_EXPIRES_IN`, see `jwt.ts`): deleted outright, falls back to not-linked. Active within the write window (`lastActiveAt`, see `WRITE_WINDOW_MS`): full access. Idle past it: `runAgent(..., "readonly")` — write tools are structurally absent, not just discouraged. A write attempt there returns `NEEDS_REVERIFICATION`; the conversation layer emails a fresh OTP, stores the message as `pendingActionText`, and re-runs it on confirmation. Any message refreshes `lastActiveAt`.
- Tiered model routing (`claudeAgent.ts`): every request first hits `WEAK_MODEL` (see file for the exact model id) with the `agent_playbook` table's rules injected into its system prompt. On `ESCALATE`, `STRONG_MODEL` takes over with the same context plus a `record_playbook_rule` tool to generalize a new rule for next time. `mode` (full/readonly) and model-tier routing are orthogonal — either tier can hit either sentinel.
- Chart engine is `lightweight-charts`, not Recharts — Recharts has no coordinate-conversion API to build drawing tools (trendline/ray/magnet-snap) on. No charting library ships those for free regardless of choice; `StockChart.tsx`'s drawing layer is a hand-built SVG overlay, imperatively driven via `useEffect`/`useRef` since no official React wrapper exists for this library.

## Known pitfalls

- `db/index.ts`'s `pg.Pool` needs its `'error'` listener — without it, a transient connection error is an uncaught exception that kills the whole process.
- `docker-compose.prod.yml` needs its explicit `name: stock-scout-prod` — without it, Compose derives the project name from the directory and collides with dev's `docker-compose.yml` (same service key, different container).
- `docker-publish.yml` only fires via `workflow_run` gated on CI passing on `main` — it won't trigger standalone on push.

<!-- /bmad:context -->
