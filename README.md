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
