FROM oven/bun:1.2.17 AS base
WORKDIR /app

# Install all dependencies (dev + prod) for building
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build frontend
FROM deps AS build
COPY . .
RUN bun run build

# Production dependencies only
FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production runtime
FROM base AS runtime

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY docker-entrypoint.sh ./

RUN mkdir -p /data && chown app:app /data
VOLUME /data

USER app

EXPOSE 3001

ENV NODE_ENV=production
ENV DATABASE_URL=/data/sqlite.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Graceful shutdown waits up to 30s for in-flight AI streams.
# Override Docker's 10s default: docker run --stop-timeout 35 ...
# Or in compose: stop_grace_period: 35s
CMD ["sh", "docker-entrypoint.sh"]
