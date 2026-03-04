# ADR 005: Bun as runtime, package manager, and test runner

## Date

2026-03-03

## Status

Accepted

## Context

Simversity needs a JavaScript/TypeScript runtime for the server, a package manager for dependencies, a bundler-compatible dev environment, and a test runner for unit tests. The standard choice is Node.js + npm + Jest/Vitest. Alternatives include Deno and Bun.

## Decision

Use Bun as the runtime, package manager, and test runner for all server-side and test code. The frontend is built with Rsbuild (Rspack-based), not Bun's bundler.

## Rationale

- **Native SQLite**: `bun:sqlite` provides a zero-dependency, high-performance SQLite driver with prepared statement support. No need for `better-sqlite3` or `sql.js`. This is used directly for the hot-path daily budget counter and by Drizzle ORM for all other queries.
- **Fast startup**: Bun's startup time is significantly faster than Node.js, which matters for the test suite (450+ unit tests) and for container startup in production.
- **Built-in test runner**: `bun:test` provides a Jest-compatible API (`describe`, `test`, `expect`, `mock`, `spyOn`) without additional dependencies. `mock.module()` enables module-level mocking for route handler tests.
- **Package manager**: `bun install` with `bun.lock` is faster than npm/yarn. The lockfile format is binary, reducing merge conflicts.
- **TypeScript native**: Bun runs `.ts` files directly without a compilation step. Server code, migration scripts, and seed scripts all execute without `tsx` or `ts-node`.
- **Bun.serve()**: The HTTP server API supports `idleTimeout` configuration (critical for long SSE streams) and integrates with Hono via `Bun.serve({ fetch: app.fetch })`.

## Consequences

- **Runtime lock-in**: `bun:sqlite` and `Bun.serve()` are Bun-specific APIs. Migrating to Node.js would require replacing the SQLite driver (e.g., with `better-sqlite3`) and the server entry point.
- **Ecosystem gaps**: Some npm packages may have Bun compatibility issues. In practice, the OpenAI SDK, Drizzle ORM, Hono, and Better-Auth all work without modification.
- **No Vitest**: The test runner is `bun:test`, not Vitest. This means no Vitest-specific features (in-source testing, browser mode). Coverage reporting uses Bun's built-in `--coverage` flag.
- **Docker image**: The Dockerfile uses `oven/bun:1.2.17` as the base image rather than `node:alpine`. Image size is comparable.
- **CI dependency**: GitHub Actions CI must install Bun (`oven-sh/setup-bun@v2`). This is a one-line setup step but adds a non-standard dependency to the CI pipeline.
