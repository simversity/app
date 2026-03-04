/**
 * Bun test preload for server-side tests.
 *
 * Mocks heavy modules (env, logger, db, auth, AI client, models) so that
 * route test files import the real route handlers but resolve to lightweight
 * in-memory substitutes for external dependencies.
 *
 * Usage: bun test --preload ./server/__tests__/preload.ts
 */
import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Mock env — must come first since other modules import it on load
// ---------------------------------------------------------------------------
const TEST_ENV = {
  DATABASE_URL: ':memory:',
  APP_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'a]Lk9$mQ!7xR^2wT#4vY&8nP@6jF*0dHsEcBgUiAoZX5',
  BETTER_AUTH_URL: 'http://localhost:3001',
  NEARAI_API_KEY: 'test-api-key-not-real',
  NEARAI_MODEL: 'deepseek-ai/DeepSeek-V3.1',
  NEARAI_MAX_TOKENS: 500,
  ADMIN_INVITE_CODE: 'test-admin-code',
  TRUST_PROXY: '0' as const,
  PORT: 3001,
};

mock.module('../lib/env', () => ({
  env: TEST_ENV,
  MAX_CONTEXT_MESSAGES: 50,
  MAX_OBSERVER_CONTEXT: 20,
  MAX_MESSAGE_CHARS: 5000,
  MAX_MESSAGES_PER_CONVERSATION: 100,
  MIN_MESSAGES_TO_COMPLETE: 5,
  POST_CONVERSATION_MAX_TOKENS: 2000,
  MID_CONVERSATION_MAX_TOKENS: 800,
  RATE_LIMIT_WINDOW_MS: 60_000,
  SHUTDOWN_GRACE_MS: 30_000,
  RATE_LIMIT_AUTH: 500,
  RATE_LIMIT_MESSAGES: 500,
  RATE_LIMIT_START_CONVERSATION: 500,
  RATE_LIMIT_OBSERVER: 500,
  RATE_LIMIT_CLAIM_ROLE: 500,
  RATE_LIMIT_ADMIN: 500,
  RATE_LIMIT_READ: 500,
  MODEL_ALLOWLIST: [],
  DAILY_MESSAGE_LIMIT: 0,
}));

// ---------------------------------------------------------------------------
// 2. Mock logger — suppress output
// ---------------------------------------------------------------------------
const noop = () => {};
const noopLog = { info: noop, warn: noop, error: noop, debug: noop };

mock.module('../lib/logger', () => ({ log: noopLog }));

// ---------------------------------------------------------------------------
// 3. Mock DB — in-memory SQLite with real migrations
// ---------------------------------------------------------------------------
const testSqlite = new Database(':memory:');
testSqlite.exec('PRAGMA journal_mode = WAL');

// Drizzle migrations use the __new_tableName pattern: create __new_X, copy data,
// drop X, ALTER TABLE __new_X RENAME TO X. The CHECK constraints reference
// __new_X."column" which causes errors during rename in modern SQLite.
// Fix: rewrite qualified column references in CHECK constraints to unqualified.
function fixCheckConstraints(sql: string): string {
  return sql.replace(/CHECK\s*\(([^)]+)\)/gi, (_match, inner: string) => {
    // Replace "__new_tableName"."col" with "col"
    const fixed = inner.replace(/"__new_\w+"\.("?\w+"?)/g, '$1');
    return `CHECK(${fixed})`;
  });
}

// Apply all migration SQL files in order
const migrationsDir = resolve(import.meta.dir, '../db/migrations');
const sqlFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of sqlFiles) {
  const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    testSqlite.exec(fixCheckConstraints(stmt));
  }
}

// Re-enable FK constraints after migrations (some migrations toggle them off)
testSqlite.exec('PRAGMA foreign_keys = ON');

// Create Drizzle instance with the test DB
// We need dynamic import since drizzle-orm is ESM
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const schema = await import('../db/schema');
const testDb = drizzle({ client: testSqlite, schema });

mock.module('../db/index', () => ({
  sqlite: testSqlite,
  db: testDb,
  clearDbTimers: noop,
}));

mock.module('../db', () => ({
  sqlite: testSqlite,
  db: testDb,
  clearDbTimers: noop,
}));

// ---------------------------------------------------------------------------
// 4. Mock auth — reads X-Test-User-Id header for session identity
// ---------------------------------------------------------------------------
// User registry: test code calls registerTestUser() to make users available
const userRegistry = new Map<
  string,
  {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string;
  }
>();

function registerTestUser(u: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
}) {
  userRegistry.set(u.id, u);
}

function clearTestUsers() {
  userRegistry.clear();
}

const mockAuth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const userId = headers.get('X-Test-User-Id');
      if (!userId) return null;
      const u = userRegistry.get(userId);
      if (!u) return null;
      return {
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          emailVerified: u.emailVerified,
          role: u.role,
        },
        session: {
          id: `session-${u.id}`,
          token: `token-${u.id}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      };
    },
  },
  handler: () =>
    new Response(JSON.stringify({ error: 'Not implemented' }), { status: 501 }),
};

mock.module('../auth', () => ({
  auth: mockAuth,
}));

// ---------------------------------------------------------------------------
// 5. Mock AI client — stub OpenAI
// ---------------------------------------------------------------------------
const mockOpenAI = {
  chat: {
    completions: {
      create: async () => {
        // Default: return an async iterable that yields one chunk
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              choices: [
                {
                  delta: { content: 'Mock AI response' },
                  finish_reason: null,
                },
              ],
            };
            yield {
              choices: [{ delta: {}, finish_reason: 'stop' }],
            };
          },
        };
      },
    },
  },
};

mock.module('../ai/client', () => ({
  openai: mockOpenAI,
  NEARAI_BASE_URL: 'https://mock.near.ai/v1',
}));

// ---------------------------------------------------------------------------
// 6. AI models — NOT mocked here (has dedicated unit tests in ai/__tests__/).
//    The real fetchModels() falls back gracefully when network fails.
//    Route tests that need controlled output mock it locally.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. Mock shared-budgets — no-op checker (always allows)
// ---------------------------------------------------------------------------
const budgetCheck = Object.assign(() => true, {
  release: () => {},
});

mock.module('../lib/shared-budgets', () => ({
  checkDailyBudget: budgetCheck,
}));

// ---------------------------------------------------------------------------
// 8. Email — NOT mocked here (has dedicated unit tests in lib/__tests__/).
//    Route tests don't trigger email sends (auth is fully mocked above).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exports for test files to use
// ---------------------------------------------------------------------------
export {
  testSqlite,
  testDb,
  registerTestUser,
  clearTestUsers,
  mockOpenAI,
  TEST_ENV,
};
