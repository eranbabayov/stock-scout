# syntax=docker/dockerfile:1

# --- deps: install once, reused by both the build and runtime stages -------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Vite frontend into dist/ ----------------------------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- runtime: only what's needed to run the server + serve the built client -
FROM node:20-alpine AS runtime
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
COPY --from=build /app/dist ./dist
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
