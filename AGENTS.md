# AGENTS.md

Simversity is a teaching simulator where educators practice responding to AI-simulated students who hold common misconceptions. AI student personas are powered by NEAR AI Cloud.

## Table of Contents

- [Commands](#commands)
- [Architecture](#architecture)
- [Key Files](#key-files)
- [Conventions](#conventions)
- [Testing](#testing)
- [NEAR AI Cloud](#near-ai-cloud)
- [Adding a Feature](#adding-a-feature-typical-flow)
- [Docs](#docs)

## Commands

- `bun run dev` — Start both frontend and backend dev servers
- `bun run dev:ui` — Start frontend dev server only (port 3000)
- `bun run dev:api` — Start backend dev server only (port 3001)
- `bun run start` — Start production server
- `bun run build` — Build for production
- `bun run preview` — Preview production build
- `bun run check` — Lint and auto-fix (Biome)
- `bun run lint` — Lint without auto-fix (Biome)
- `bun run format` — Auto-format
- `bun run type-check` — Type-check all tsconfig projects
- `bun run db:generate` — Generate Drizzle migrations
- `bun run db:push` — Push schema directly to SQLite (no migration files)
- `bun run db:migrate` — Run Drizzle migrations
- `bun run db:seed` — Seed courses, scenarios, personas, and test user
- `bun run db:studio` — Open Drizzle Studio GUI
- `bun run promote-admin` — Promote a user to admin by email
- `bun run test` — Run Playwright E2E tests
- `bun run test:ui` — Run Playwright E2E tests with interactive UI
- `bun run test:unit` — Run Bun unit tests (server/ and src/)
- `bun run prepare` — Install Lefthook git hooks

## Architecture

- **Frontend** (port 3000): React 19, TanStack Router (file-based), Tailwind v4, shadcn/ui. Built with Rsbuild. Path alias `@/` → `src/`. In dev, Rsbuild proxies all `/api` requests to `localhost:3001` (configured in `rsbuild.config.ts` under `server.proxy`), so the frontend code always fetches from its own origin.
- **Backend** (port 3001): Hono on Bun. All API routes under `/api/*`. In production, Rsbuild's static output is served directly by the Hono server, so both UI and API run on the same port.
- **Database**: SQLite via Drizzle ORM. Schema at `server/db/schema.ts`. Tables: `user`, `session`, `account`, `verification`, `accessCode`, `course`, `persona`, `scenario`, `scenarioAgent`, `conversation`, `message`, `observerMessage`, `progress`, `dailyBudget`.
- **Auth**: Better-Auth (email/password). Session checked via `requireAuth` middleware. Access user with `c.get('user') as AppUser` (import from `server/lib/types`). Transactional email via Resend (`RESEND_API_KEY`, `EMAIL_FROM`); falls back to console logging when API key is not set.
- **AI**: NEAR AI Cloud via OpenAI SDK. Client at `server/ai/client.ts`. Prompts at `server/ai/prompts.ts`.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                             │
│                                                                     │
│  useConversation ──┐                      ┌── useObserver           │
│       │            │  useStreamingChat     │       │                 │
│       └────────────┤  (shared reducer)     ├───────┘                │
│                    │                       │                         │
│                    └───┐             ┌─────┘                        │
│                        ▼             ▼                               │
│                      fetchSSE    fetchSSE                            │
│                        │             │                               │
│                   readSSEStream readSSEStream                        │
│                        │             │                               │
└────────────────────────┼─────────────┼──────────────────────────────┘
                         │             │
              POST /messages    POST /observer
                         │             │
┌────────────────────────┼─────────────┼──────────────────────────────┐
│ Server                 │             │                               │
│                        ▼             ▼                               │
│                  requireVerified middleware                          │
│                  checkRateLimit + checkDailyBudget                   │
│                        │             │                               │
│            ┌───────────┘             └───────────┐                  │
│            ▼                                     ▼                  │
│     buildChatContext()                  buildObserverContext()       │
│      ├─ findScenario()                  ├─ transcript as XML        │
│      ├─ loadScenarioAgents()            ├─ mid vs post mode         │
│      ├─ message history                 └─ observer history         │
│      └─ buildGroupContext()                      │                  │
│            │                                     │                  │
│            ▼                                     ▼                  │
│     saveUserMessage() ◄──── server/lib/streaming.ts ────►           │
│            │                                     │                  │
│     trimMessagesToFit()                   trimMessagesToFit()        │
│            │                                     │                  │
│     withRetry → NEAR AI Cloud (stream:true)      │                  │
│            │                                     │                  │
│     streamAndSaveAIResponse() ◄──────────────────┘                  │
│      ├─ trackStream()                                               │
│      ├─ SSE deltas → browser                                       │
│      ├─ INSERT message + bump counter                               │
│      ├─ UPSERT progress (conversation only)                        │
│      └─ untrackStream()                                             │
│                                                                     │
│ Tables: message ◄──conversation──► observerMessage                  │
│         persona ◄──scenarioAgent──► scenario ◄── course             │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Files

| Purpose | Path |
|---|---|
| Server entrypoint | `server/index.ts` |
| DB schema & relations | `server/db/schema.ts` |
| Env config | `server/lib/env.ts` |
| Auth setup | `server/auth.ts` |
| Email utility (Resend) | `server/lib/email.ts` |
| Auth middleware | `server/middleware/auth.ts` |
| AI client (NEAR AI) | `server/ai/client.ts` |
| Observer prompt builder | `server/ai/prompts.ts` |
| Scenario seed data | `server/ai/scenarios.ts` |
| Model list & pricing | `server/ai/models.ts` |
| DB connection | `server/db/index.ts` |
| DB seed (courses/scenarios) | `server/db/seed.ts` |
| Conversation API | `server/routes/conversations.ts` |
| Message sending + multi-agent streaming | `server/routes/conversation-messages.ts` |
| Observer API | `server/routes/observer.ts` |
| Course API routes | `server/routes/courses.ts` |
| Admin API (CRUD) | `server/routes/admin/index.ts` |
| Progress API routes | `server/routes/progress.ts` |
| User API routes | `server/routes/user.ts` |
| Model selection API | `server/routes/models.ts` |
| Conversation hook | `src/hooks/useConversation.ts` |
| Observer hook | `src/hooks/useObserver.ts` |
| SSE streaming utils | `src/hooks/sse-stream.ts` |
| Query client & keys | `src/lib/query-client.ts`, `src/lib/query-keys.ts` |
| Frontend utilities (cn, isAdmin) | `src/lib/utils.ts` |
| API fetch/mutate & ApiError | `src/lib/api.ts` |
| Typed query key factory | `src/lib/query-keys.ts` |
| User-friendly error messages | `src/lib/error-messages.ts` |
| Error checking utilities | `src/lib/error-utils.ts` |
| Status formatting helpers | `src/lib/status-utils.ts` |
| Frontend API types | `src/types/api.ts` |
| App layout (authed) | `src/components/layout/AppLayout.tsx` |
| Conversation context builder (re-exports agent-cache & agent-detection) | `server/lib/conversation-helpers.ts` |
| Agent loading & cache | `server/lib/agent-cache.ts` |
| Direct addressing detection | `server/lib/agent-detection.ts` |
| Message response handlers (single/multi-agent, inline nudge) | `server/lib/message-handlers.ts` |
| Streaming save utilities | `server/lib/streaming.ts` |
| Rate limiter factory | `server/lib/rate-limit.ts` |
| Daily message budget | `server/lib/daily-budget.ts` |
| Context trimming | `server/lib/token-estimate.ts` |
| Retry wrapper for AI calls | `server/lib/retry.ts` |
| Graceful shutdown & stream tracking | `server/lib/shutdown.ts` |
| Validation helpers (parseBody, parseUUID, escapeRegex, requireUUID middleware) | `server/lib/validation.ts` |
| Pagination helper | `server/lib/pagination.ts` |
| Client IP extraction | `server/lib/request.ts` |
| Audit logging | `server/lib/audit.ts` |
| Role & status enums, streaming/cache constants | `server/lib/constants.ts` |
| Model allowlist check | `server/lib/model-check.ts` |
| Rate-limit map eviction | `server/lib/store-utils.ts` |
| AI call retry + error classification | `server/lib/ai-helpers.ts` |
| Shared daily budget instance | `server/lib/shared-budgets.ts` |
| Server utilities (pickDefined, buildUpdateSet) | `server/lib/utils.ts` |
| Structured logger | `server/lib/logger.ts` |
| AppUser & shared types | `server/lib/types.ts` |
| Streaming state machine | `src/hooks/useStreamingChat.ts` |
| App config hook | `src/hooks/useAppConfig.ts` |
| Page title hook | `src/hooks/usePageTitle.ts` |
| Mobile viewport detection | `src/hooks/useIsMobile.ts` |
| Observer section parser | `src/lib/observer-parser.ts` |
| Frontend constants (APP_NAME) | `src/lib/constants.ts` |
| shadcn/ui config | `components.json` |

## Conventions

- **Package manager**: Bun. Never use npm/yarn.
- **Linting**: Biome (`bun run check`). Single quotes, 2-space indent. No ESLint/Prettier.
- **Imports**: Biome auto-sorts. Use `@/` alias for frontend src imports.
- **UI components**: Use existing shadcn/ui in `src/components/ui/` before creating new ones. Add with `bunx shadcn@latest add <component>`.
- **Routes**: TanStack Router auto-generates `src/routeTree.gen.ts` — never edit manually. Protected routes under `_app/`, auth routes under `_auth/`.
- **API validation**: Zod schemas with `.safeParse()` for POST bodies. Return `{ error: string }` on failure.
- **DB**: Drizzle query builder. Wrap multi-step mutations in `db.transaction()`. Use `crypto.randomUUID()` for IDs (text PKs).
- **Streaming**: SSE via Hono `streamSSE()`. Shared client utilities in `src/hooks/sse-stream.ts` (`fetchSSE`, `readSSEStream`). Consumed by `src/hooks/useConversation.ts` (chat) and `src/hooks/useObserver.ts` (observer feedback). All events use `event: message` with JSON `data:` lines containing a `type` discriminant:
  - `{ type: "delta", text: string }` — each streamed AI token chunk
  - `{ type: "done", messageId: string, agentId?: string, agentName?: string }` — conversation endpoint (agent fields present)
  - `{ type: "done", messageId: string }` — observer endpoint (no agent fields)
  - `{ type: "error", message: string }` — AI failure, empty response, or DB save failure
  - `{ type: "observer_nudge", text: string }` — inline observer nudge during multi-agent turns
  - See [docs/skills/streaming-endpoint.md](docs/skills/streaming-endpoint.md) for the full SSE protocol reference.
- **State**: No global store. TanStack Query for server state, `useState`/`useReducer` for local state. Auth via `useSession()` from `src/lib/auth-client.ts`. Toast notifications via `sonner`.
- **Error handling**: Global `app.onError()` in `server/index.ts`. Route handlers return `c.json({ error: '...' }, 4xx)` for expected failures.

## Testing

### Commands

- `bun run test:unit` — Run all unit tests (server/ and src/). **Never use bare `bun test`.**
- `bun run test` — Run Playwright E2E tests
- `bun run test:coverage` — Run unit tests with coverage report (outputs to `coverage/`)

### Unit Tests

- Framework: `bun:test`
- Location: `__tests__/` directories adjacent to source, `.test.ts(x)` suffix
- DOM setup: `happy-dom` preload for component tests (`src/components/__tests__/setup-dom.ts`)

### E2E Tests

- Framework: Playwright
- Location: `tests/` directory, `.spec.ts` suffix
- Helpers: `tests/helpers.ts` — `uniqueUser()`, `loginUser()`, `sendMessage()`, `apiRequest()`
- Seed data: `SEED` constants in `tests/helpers.ts` must stay in sync with `server/ai/scenarios.ts`

### Mocking Patterns

- **Logger**: `mock.module('../logger', () => ({ log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }))`
- **DB**: In-memory SQLite for integration tests (see `server/db/__tests__/schema-integration.test.ts`)
- **Side effects**: `spyOn` / `mock` from `bun:test`
- **Route tests**: Hono app factory with mocked dependencies (future: import real handlers with `mock.module` preload)

### Isolation

- Cleanup in `afterEach` — fresh state per test
- Call `clearAgentCache()` after cache tests
- E2E: `uniqueUser()` creates unique users per test to avoid cross-test interference

### Key Qualities

- **Determinism**: Mock AI responses, mock `Date.now()` for time-dependent logic
- **Isolation**: Unique users, in-memory DB, reset shared state
- **Boundary testing**: Test edge cases (empty input, expired entries, capacity limits)
- **Right layer**: Test pure logic directly; avoid reimplementing algorithms in tests

## NEAR AI Cloud

NEAR AI Cloud provides private, verifiable AI inference inside Trusted Execution Environments (TEEs). The API is **fully OpenAI-compatible** — use the standard `openai` npm package with a different base URL.

### Configuration

```
Base URL: https://cloud-api.near.ai/v1
Auth: Bearer token (API key from https://cloud.near.ai/api-keys)
```

Env vars in `server/lib/env.ts`:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | — | Min 32 chars. `openssl rand -hex 32` |
| `NEARAI_API_KEY` | Yes | — | From https://cloud.near.ai/api-keys |
| `DATABASE_URL` | No | `sqlite.db` | Path to SQLite file |
| `APP_URL` | No | `http://localhost:3000` | Auto-detected on Railway |
| `BETTER_AUTH_URL` | No | same as `APP_URL` | Auth callback base URL |
| `NEARAI_MODEL` | No | `deepseek-ai/DeepSeek-V3.1` | Model ID |
| `NEARAI_MAX_TOKENS` | No | `500` | Max response tokens |
| `ADMIN_INVITE_CODE` | No | `''` | Invite code for admin role |
| `RESEND_API_KEY` | No | — | Transactional email. Falls back to console |
| `EMAIL_FROM` | No | — | Required when `RESEND_API_KEY` is set |
| `MODEL_ALLOWLIST` | No | `''` (all) | Comma-separated allowed model IDs |
| `DAILY_MESSAGE_LIMIT` | No | `0` (unlimited) | Global daily AI message budget |
| `MOCK_AI` | No | — | Set `1` for offline dev (not production) |
| `MOCK_AI_PORT` | No | `4100` | Port for mock AI server (dev/CI only) |
| `TRUST_PROXY` | No | `0` | Set `1` behind a reverse proxy to trust `X-Forwarded-For` |
| `TEST_MODE` | No | — | Set `1` for CI (raised rate limits, not production) |
| `TEST_USER_PASSWORD` | No | — | Override test user password from `bun run db:seed` |
| `PORT` | No | `3001` | Server listen port (auto-set by Railway) |

### Client Setup (`server/ai/client.ts`)

```ts
import OpenAI from 'openai';
import { env } from '../lib/env';

export const NEARAI_BASE_URL = 'https://cloud-api.near.ai/v1';

const mockAiPort = process.env.MOCK_AI_PORT || '4100';
const useMockAi = process.env.MOCK_AI === '1';

if (useMockAi && process.env.NODE_ENV === 'production') {
  throw new Error('MOCK_AI must not be enabled in production');
}

export const openai = new OpenAI({
  baseURL: useMockAi ? `http://127.0.0.1:${mockAiPort}/v1` : NEARAI_BASE_URL,
  apiKey: useMockAi ? 'mock-key' : env.NEARAI_API_KEY,
  timeout: 60_000,
});
```

### Making Requests

```ts
// Non-streaming
const completion = await openai.chat.completions.create({
  model: env.NEARAI_MODEL,
  max_tokens: env.NEARAI_MAX_TOKENS,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Hello' },
  ],
});
console.log(completion.choices[0].message.content);

// Streaming
const stream = await openai.chat.completions.create({
  model: env.NEARAI_MODEL,
  max_tokens: env.NEARAI_MAX_TOKENS,
  messages: [...],
  stream: true,
});

for await (const chunk of stream) {
  const text = chunk.choices[0]?.delta?.content;
  if (text) process.stdout.write(text);
}
```

### Available Models

Models are fetched dynamically at runtime via `server/ai/models.ts`. See the [NEAR AI Cloud docs](https://docs.near.ai) for the current model catalog, pricing, and capabilities.

## Adding a Feature (typical flow)

1. Add/modify tables in `server/db/schema.ts`, define relations, run `bun run db:generate && bun run db:push`
2. Create route file in `server/routes/`, apply `requireVerified` (or `requireAuth` for read-only), add Zod validation for POST bodies
3. Mount route in `server/index.ts` with `app.route('/api/...', routes)`
4. Create page in `src/routes/_app/` — TanStack Router picks it up automatically
5. Fetch data with `useQuery()` from `@tanstack/react-query` using `apiFetch()` from `src/lib/api.ts` and keys from `src/lib/query-keys.ts`
6. Run `bun run check` to lint

## Docs

- [Architecture Decision Records](docs/adr/) — SSE over WebSocket, SQLite over PostgreSQL, no global state store, NEAR AI Cloud, Bun runtime, sequential multi-agent, in-process rate limiting
- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
- NEAR AI Cloud: https://docs.near.ai
- NEAR AI Cloud API: https://github.com/nearai/cloud-api
