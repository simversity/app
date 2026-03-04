# ADR 002: SQLite over PostgreSQL

## Date

2025-01-15 (amended 2026-03-03)

## Status

Accepted

## Context

Simversity needs a relational database for users, sessions, conversations, messages, courses, scenarios, personas, progress tracking, and access control. The schema has grown to 14 tables with 30+ indexes. The two primary candidates are SQLite (embedded) and PostgreSQL (client-server).

## Decision

Use SQLite via Drizzle ORM as the primary database.

## Rationale

- **Zero infrastructure**: SQLite requires no separate database server. The database is a single file on disk, simplifying deployment to a single container with a mounted volume.
- **Single-writer model**: Simversity runs as a single Bun process. SQLite's serialized write model eliminates the need for row-level locking, `SELECT ... FOR UPDATE`, or advisory locks. TOCTOU prevention is simpler — a transaction guarantees exclusive access.
- **Performance**: For the expected scale (university instructors, not millions of concurrent users), SQLite's read performance exceeds PostgreSQL's due to zero network latency. WAL mode enables concurrent reads during writes.
- **Tuned PRAGMAs**: The connection sets `journal_mode = WAL`, `busy_timeout = 5000` (block up to 5s on write contention rather than failing immediately), `synchronous = NORMAL`, `foreign_keys = ON`, `cache_size = -64000` (64MB), and `temp_store = MEMORY`. The graceful shutdown handler runs `PRAGMA wal_checkpoint(TRUNCATE)` to ensure durability.
- **Drizzle ORM compatibility**: Drizzle supports both SQLite and PostgreSQL with the same query builder API. Migration to PostgreSQL is possible by changing the driver and regenerating migrations.
- **Cost**: No database hosting cost. The database lives on Railway's persistent volume ($0.25/GB/month vs. $7+/month for a managed PostgreSQL instance).

## Consequences

- **Single-process constraint**: Only one Bun process can write at a time. Horizontal scaling requires migrating to PostgreSQL or using a SQLite replication layer (e.g., LiteFS, Turso).
- **Application-level cleanup**: SQLite has no background daemon for expiring rows. The server runs `setInterval` cleanup jobs for expired sessions, verifications, and access codes in `server/db/index.ts`.
- **Hot-path raw SQL**: The daily budget counter (`server/lib/daily-budget.ts`) uses Bun's raw `database.query()` prepared statements instead of Drizzle for performance on the per-request check/increment path.
- **sortOrder computation**: The current `COUNT(*)` approach for message sortOrder is safe under SQLite's serialized writes but would need `SELECT ... FOR UPDATE` on PostgreSQL. This is documented with a `TODO(postgres)` comment.
- **No full-text search**: SQLite FTS5 exists but isn't used. If search becomes important, a dedicated search index would be needed regardless of DB choice.
- **No LISTEN/NOTIFY**: Real-time change notifications would need polling or an application-level pubsub if added later.
