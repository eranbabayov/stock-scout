# syntax=docker/dockerfile:1
#
# Produces two separate images from one file, selected via `--target`:
#   backend  - Express API + Telegram bot (docker-compose target: backend)
#   frontend - nginx serving the built static client, proxying /api to the
#              backend service (docker-compose target: frontend)

# --- deps: install once, reused by both the build and backend stages -------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Vite frontend into dist/ ----------------------------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- backend: API + Telegram bot, no frontend assets ------------------------
FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production

# The server runs its TypeScript directly via tsx (same as in dev), so
# node_modules (including tsx and drizzle-kit for migrations) travels as-is
# rather than going through a separate compile step.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY server ./server
COPY shared ./shared
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && \
    addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]

# --- frontend: static build served by nginx, proxying /api to the backend --
FROM nginx:1.27-alpine AS frontend
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
# 127.0.0.1, not localhost — this minimal image resolves "localhost" to ::1
# first, and nginx only binds the IPv4 wildcard, so the IPv6 attempt refuses.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
