# ADR 007: In-process rate limiting over Redis

## Date

2026-03-03

## Status

Accepted

## Context

All mutation endpoints (message sending, observer requests, conversation creation, auth attempts) need rate limiting to prevent abuse and control AI API costs. Options range from a simple in-memory counter to a Redis-backed distributed rate limiter.

## Decision

Use an in-process sliding-window rate limiter backed by a `Map<string, number[]>` in server memory.

## Rationale

- **Zero infrastructure**: No Redis server to provision, configure, or pay for. Consistent with the SQLite decision (ADR 002) — minimize external dependencies for a single-process application.
- **Negligible latency**: Map lookups are nanoseconds vs. Redis round-trips (typically 0.5-1ms). For a hot path checked on every AI request, this matters.
- **Simple implementation**: `createRateLimiter()` in `server/lib/rate-limit.ts` is a 60-line factory function. Each limiter maintains its own `Map` with a configurable window and max-requests. The sliding window is implemented by filtering timestamps within the window on each check.
- **Lazy cleanup**: `maybeCleanup()` runs every 100 checks and evicts expired entries across all keys. This avoids timer overhead while preventing unbounded memory growth.
- **Rate limit headers**: `setRateLimitHeaders()` sets standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. The `.info()` method allows inspecting limits without consuming a slot.
- **TEST_MODE multiplier**: When `TEST_MODE=1`, all rate limits are multiplied by 10-20x to prevent E2E test flakiness. This is checked at startup and refused in production.

## Consequences

- **Limits reset on restart**: Server restarts clear all rate limit state. This is acceptable — rate limits exist to prevent sustained abuse, not to survive restarts.
- **Per-process only**: If the application were horizontally scaled to multiple processes, each would maintain independent rate limit state. A user could bypass limits by hitting different processes. This is not a concern while running as a single Bun process (see ADR 002).
- **Memory proportional to active users**: Each active user key stores an array of timestamps (up to `maxRequests` entries). For the expected user base (hundreds of university instructors, not millions), this is negligible.
- **No distributed coordination**: The daily message budget (`server/lib/daily-budget.ts`) is a separate mechanism that persists to SQLite, providing a durable global limit that survives restarts. Rate limiting (short-term burst protection) and daily budgets (long-term cost control) are intentionally separate concerns.
