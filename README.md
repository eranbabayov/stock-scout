# Stock Scout

A personal stock watchlist and technical-screening app: track stocks, chart EMA/SMA moving averages and Fibonacci retracements, log trades, and (optionally) manage it all from Telegram via a natural-language assistant.

Runs entirely on your own machine — a local PostgreSQL database (Docker) and a self-hosted Express backend, no cloud accounts required for the core app.

## Local setup

```
docker compose up -d      # start Postgres (only needed once per reboot/if stopped)
npm install
npm run db:migrate        # apply the schema
npm run dev                # starts both frontend (Vite) and backend (Express)
```

Open http://localhost:8080. `docker compose down` stops Postgres when you're done (your data persists in the Docker volume).

Config lives in two `.env` files (copy from the `.env.example` next to each): the root `.env` for the frontend, `server/.env` for the backend/database/secrets. Neither is committed to git.

## Telegram assistant setup (optional)

Lets you text the app on Telegram — "add AAPL to my watchlist", "find a stock near Fib 61.8 within 2%, above EMA150" — after verifying your account with an emailed one-time code. This is entirely optional; the web app works fully without it.

No public URL or tunnel is needed — the bot long-polls Telegram for messages, so it works from behind your home router with zero extra setup. It needs two external services:

### 1. Telegram bot token
1. In Telegram, message [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Follow the prompts (pick a name and a username ending in `bot`).
3. BotFather replies with a token like `123456789:AAH...` → put it in `server/.env` as `TELEGRAM_BOT_TOKEN`.

### 2. Anthropic API key
Get a key from [console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY` in `server/.env`. This is billed separately from any Claude.ai subscription (pay-per-use; a personal bot's volume costs a few cents).

### 3. Gmail app password (sends the login code)
In your Google Account → Security → App Passwords, generate one for "Mail". Put your Gmail address and the generated password in `server/.env` as `GMAIL_USER` / `GMAIL_APP_PASSWORD`. (Requires 2-Step Verification to be enabled on the account.)

## Turning the Telegram assistant on

1. `docker compose up -d` and `npm run dev` (as above). The bot starts polling automatically as part of `npm run dev` once `TELEGRAM_BOT_TOKEN` is set — no separate process or tunnel needed.
2. Open your bot in Telegram (the `t.me/<your bot username>` link BotFather gave you) and send your Stock Scout account's email, then the 6-digit code that arrives by email. You're now linked — try "add AAPL to my watchlist" or "what's on my watchlist".

Send `logout` any time to unlink that chat.

## Turning it off

Stop `npm run dev` (Ctrl+C) — this also stops the Telegram bot. `docker compose down` if you want Postgres to stop too — your data stays in the Docker volume either way.

## Deploying

The app ships as three containers: **nginx** (serves the built frontend and reverse-proxies `/api` to the backend), the **backend** (Express API + Telegram bot), and **Postgres**. Both app images build from the one `Dockerfile` (`--target backend` / `--target frontend`) so there's no duplicated build logic. This is a single-node setup — see "Scaling notes" below for what that does and doesn't cover.

### Run it anywhere Docker runs

```
cp .env.prod.example .env.prod    # fill in real secrets — this file is gitignored, never commit it
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

That builds both images locally from the `Dockerfile` and starts all three containers. On startup the backend automatically runs any pending database migrations (`docker-entrypoint.sh`) before starting the server. Visit `http://localhost:8080` (or whatever `APP_PORT` you set) — only nginx is published to the host; the backend is reachable solely over the internal Compose network.

For a real deployment, put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of the frontend container's port — auth cookies are marked `secure` in production and won't be sent over plain HTTP. Set `CLIENT_ORIGIN` in `.env.prod` to your public HTTPS URL.

`docker compose -f docker-compose.prod.yml down` stops all three containers; your data stays in the `stock_scout_pgdata_prod` Docker volume. Add `-v` to also delete it.

### CI/CD

- **`.github/workflows/ci.yml`** — on every push/PR to `main`: typecheck (frontend, server, and vite config), lint, run the test suite, and build the frontend. This is the merge gate.
- **`.github/workflows/docker-publish.yml`** — after CI passes on `main` (or on a `v*` tag, or manually via workflow_dispatch), builds both `Dockerfile` targets and pushes them to GitHub Container Registry at `ghcr.io/<owner>/<repo>-backend` and `ghcr.io/<owner>/<repo>-frontend` (no extra secrets needed — it uses the built-in `GITHUB_TOKEN`). Each is tagged `latest` on `main`, plus a short-SHA tag and, for releases, the version tag.

To run the published images instead of building locally, set in `.env.prod`:
```
BACKEND_IMAGE=ghcr.io/<your-github-username>/stock-scout-backend:latest
FRONTEND_IMAGE=ghcr.io/<your-github-username>/stock-scout-frontend:latest
```
then:
```
docker compose --env-file .env.prod -f docker-compose.prod.yml pull backend frontend
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```
(GHCR packages are private by default — either make each package public in its GitHub settings, or `docker login ghcr.io` with a token that has `read:packages` before pulling.)

### Scaling notes

This is hardened for realistic multi-user concurrent load on **one machine** — connection pooling, a bounded Yahoo Finance request limiter with in-flight de-duplication, bounded Telegram message concurrency, and auth rate limiting are all in place (see git history for the "scale-readiness pass" if you want the details). It is **not** a horizontally-scaled architecture: there's one Postgres instance and one app process. If you outgrow a single machine, the natural next steps are a managed Postgres instance and running multiple app replicas behind a load balancer — not needed until you're well past personal/small-team scale.
