# Deployment

How to build, configure, and deploy Simversity to production with Docker and Railway.

## Overview

| Component | Technology | Config |
|---|---|---|
| Runtime | Bun | `Dockerfile`, `package.json` |
| Container | Multi-stage Docker build | `Dockerfile`, `.dockerignore` |
| Database | SQLite (file-based, volume-mounted) | `drizzle.config.ts` |
| Hosting | Railway (or any Docker host) | Auto-detected env vars |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

## Docker Build

The `Dockerfile` uses a 5-stage multi-stage build:

```
base        → oven/bun:1.2.17
  ↓
deps        → bun install --frozen-lockfile (all deps)
  ↓
build       → bun run build (Rsbuild frontend → dist/)
  ↓
prod-deps   → bun install --frozen-lockfile --production
  ↓
runtime     → Non-root user, dist/ + server/ + node_modules/
```

### Runtime Stage

- Creates non-root user `app:app`
- Copies: `dist/` (frontend), `server/` (backend), `node_modules/` (prod only), `package.json`, `docker-entrypoint.sh`
- Creates `/data` volume for SQLite (writable by `app`)
- Exposes port **3001**
- Sets `NODE_ENV=production`, `DATABASE_URL=/data/sqlite.db`

### Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
```

The `/api/health` endpoint checks DB connectivity with a raw SQL query and returns `503` if the server is shutting down.

## Startup Sequence

`docker-entrypoint.sh` runs three steps:

### 1. Pre-flight Checks

- Extracts DB directory from `DATABASE_URL`
- Verifies directory exists and is writable (touch test)
- Fails immediately if directory is missing or read-only

### 2. Database Migrations

- Runs `bun server/db/migrate.ts` with **3 retry attempts** and exponential backoff (2s, 4s delays)
- Exits with code 1 if all retries fail

### 3. Server Start

- Runs `server/index.ts` via exec (replaces shell process for proper signal handling)

## Railway Auto-Detection

`server/lib/env.ts` auto-detects Railway-specific env vars:

```ts
// APP_URL auto-detection
const appUrl =
  process.env.APP_URL ||
  (railwayDomain ? `https://${railwayDomain}` : 'http://localhost:3000');

// DATABASE_URL auto-detection
const dbUrl =
  process.env.DATABASE_URL ||
  (volumePath ? `${volumePath}/sqlite.db` : 'sqlite.db');
```

| Railway Env Var | What It Does |
|---|---|
| `RAILWAY_PUBLIC_DOMAIN` | Sets `APP_URL` to `https://{domain}` |
| `RAILWAY_VOLUME_MOUNT_PATH` | Sets `DATABASE_URL` to `{path}/sqlite.db` |
| `PORT` | Sets server listen port (Railway assigns this) |

With these, a Railway deploy needs only three manually-set env vars: `BETTER_AUTH_SECRET`, `NEARAI_API_KEY`, and optionally `ADMIN_INVITE_CODE`.

## Production Environment Variables

See [AGENTS.md → Configuration](../AGENTS.md#configuration) for the full environment variable reference. The two required variables are `BETTER_AUTH_SECRET` and `NEARAI_API_KEY`.

### Danger: Never Set in Production

| Variable | Why |
|---|---|
| `MOCK_AI=1` | Throws `Error('MOCK_AI must not be enabled in production')` |
| `TEST_MODE=1` | Throws `Error('TEST_MODE must not be enabled in production')` |

Both guards are checked at startup in `server/lib/env.ts` and `server/ai/client.ts`.

## Production Server Features

### Security Headers

Set on every response in `server/index.ts`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (HSTS, 2 years)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- **CSP**: `default-src 'self'`, scripts `'self'` only, styles allow `'unsafe-inline'` + Google Fonts, images allow `data:` URIs, frames `'none'`

### CORS

- Origin: locked to `APP_URL`
- Credentials: `true` (cookies)

### Static Asset Caching

- `/static/*` paths: `Cache-Control: public, max-age=31536000, immutable` (1 year, content-hashed)
- All other routes: served from `dist/` with SPA fallback to `index.html`

### Graceful Shutdown

`server/lib/shutdown.ts` manages the shutdown lifecycle:

1. `canAcceptStream()` — checked before starting new AI streams; returns `false` during shutdown
2. `trackStream()` / `untrackStream()` — reference counting for active streams
3. On SIGTERM/SIGINT: stops accepting new streams, waits for active streams to finish, then exits
4. `/api/health` returns `503` during shutdown

### Error Logging

Structured JSON logs with: `requestId`, `method`, `path`, `error`, `stack`, `userId`, `timestamp`.

## Building and Running

### Local Docker

```bash
# Build
docker build --target runtime -t simversity .

# Run (with volume for persistent DB)
docker run -p 3001:3001 \
  -v simversity-data:/data \
  -e BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  -e NEARAI_API_KEY=your-key \
  simversity
```

### Production Checklist

1. Set `BETTER_AUTH_SECRET` to a unique random value (not the CI default)
2. Set `NEARAI_API_KEY` from https://cloud.near.ai/api-keys
3. Ensure `/data` volume is persistent (survives container restarts)
4. Confirm `MOCK_AI` and `TEST_MODE` are **not** set
5. Run `bun run db:seed` once after first deploy to populate courses and scenarios
6. Optionally set `ADMIN_INVITE_CODE` for first admin user, then use DB access codes going forward

## CI Pipeline

`.github/workflows/ci.yml` runs 5 jobs on push/PR to `main`:

| Job | What It Checks | Depends On |
|---|---|---|
| `check` | Type-check, lint, build, unit tests | — |
| `test` | Playwright E2E (with `MOCK_AI=1`, `TEST_MODE=1`) | `check` |
| `docker` | Docker image builds successfully | `check` |
| `docs` | File paths, commands, endpoints exist | — |
| `security` | CodeQL static analysis | — |

The `docker` job validates the Dockerfile builds but does not push the image.

## Key Files

- `Dockerfile` — Multi-stage build (base → deps → build → prod-deps → runtime)
- `docker-entrypoint.sh` — Pre-flight checks, migration retry, server start
- `.dockerignore` — Excludes tests, docs, IDE config, secrets from build context
- `server/index.ts` — Production server: security headers, CORS, health check, static serving, error logging
- `server/lib/env.ts` — Env var validation, Railway auto-detection, production guards
- `server/lib/shutdown.ts` — Graceful shutdown (stream tracking, SIGTERM handling)
- `.github/workflows/ci.yml` — CI pipeline (check, test, docker, docs, security)
- `rsbuild.config.ts` — Frontend build output (`dist/`)

## See Also

- `testing.md` — CI test behavior with `MOCK_AI` and `TEST_MODE`
- `auth.md` — Production auth configuration (secrets, email, invite codes)
