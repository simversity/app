# Writing Tests

Guide for writing unit tests (Bun) and E2E tests (Playwright) for Simversity.

## Overview

| Layer | Framework | Command | Config |
|---|---|---|---|
| Unit | Bun test runner (`bun:test`) | `bun run test:unit` | `tsconfig.test.json` |
| E2E | Playwright | `bun run test` | `playwright.config.ts` |

## Unit Tests

### File Conventions

- Place tests adjacent to source in `__tests__/` directories
- Naming: `<module>.test.ts` (e.g. `streaming.test.ts`)
- Server tests: `server/**/__tests__/*.test.ts`
- Frontend tests: `src/**/__tests__/*.test.ts`

### Writing a Route Handler Test

Test route logic with standalone Hono apps — no real database or auth needed:

```ts
import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';

function createApp(options: { authenticated?: boolean }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (options.authenticated) {
      c.set('user', { id: 'test-user', role: 'teacher' });
    }
    await next();
  });
  // Mount your route logic inline or import the handler
  app.get('/test', (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ ok: true });
  });
  return app;
}

describe('GET /test', () => {
  test('returns 401 when unauthenticated', async () => {
    const app = createApp({ authenticated: false });
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  test('returns 200 when authenticated', async () => {
    const app = createApp({ authenticated: true });
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});
```

### Mocking Modules

Use `mock.module()` to replace imports. Install mocks **before** dynamically importing the module under test:

```ts
import { afterEach, describe, expect, mock, test } from 'bun:test';

// Mock the database module
const mockInsert = mock(() => ({ values: mock(() => Promise.resolve()) }));
mock.module('../../db', () => ({
  db: {
    insert: mockInsert,
    select: mock(() => ({ from: mock(() => ({ where: mock(() => []) })) })),
    transaction: mock((fn: Function) => fn({
      insert: mockInsert,
      update: mock(() => ({ set: mock(() => ({ where: mock(() => {}) })) })),
    })),
  },
}));

// Import AFTER mocks are installed
const { saveUserMessage } = await import('../../lib/streaming');

afterEach(() => {
  mockInsert.mockClear();
});
```

### Testing Time-Dependent Code

Monkey-patch `Date.now` for rate limiters, budgets, and cache expiry:

```ts
const realDateNow = Date.now;
afterEach(() => { Date.now = realDateNow; });

test('expires after window', () => {
  const limiter = createRateLimiter(1);
  limiter('user-1'); // first call OK

  // Advance time past the window
  Date.now = () => realDateNow() + 61_000;
  expect(limiter('user-1')).toBe(true); // allowed again
});
```

### Testing SSE Streams

Create fake `Response` objects with `ReadableStream` bodies:

```ts
function fakeResponse(...chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

test('parses delta events', async () => {
  const deltas: string[] = [];
  const res = fakeResponse('data: {"type":"delta","text":"hello"}\n\n');
  await readSSEStream(res, {
    onDelta: (text) => deltas.push(text),
  });
  expect(deltas).toEqual(['hello']);
});
```

### Testing the State Machine

Test the `streamingReducer` directly without React:

```ts
import { initialState, streamingReducer } from '../useStreamingChat';

test('ADD_USER_MESSAGE sets streaming status', () => {
  const state = streamingReducer(initialState, {
    type: 'ADD_USER_MESSAGE',
    id: 'msg-1',
    content: 'hello',
  });
  expect(state.status).toBe('streaming');
  expect(state.messages).toHaveLength(1);
});
```

## E2E Tests (Playwright)

### File Conventions

- All specs in `tests/*.spec.ts`
- Shared helpers in `tests/helpers.ts`
- Global setup in `tests/global-setup.ts`

### Environment Setup

E2E tests require two special env vars:

| Var | Purpose |
|---|---|
| `MOCK_AI=1` | Routes AI calls to the mock server (`server/ai/mock-server.ts`) instead of NEAR AI Cloud. Returns deterministic canned responses. |
| `TEST_MODE=1` | Enables `/api/test/verify-email` endpoint and raises all rate limits (10x-20x normal). Must not be used in production. |

Playwright config launches both servers automatically:
- Port 3001: Backend (resets DB, seeds, starts Hono)
- Port 3000: Frontend (Rsbuild dev server)

### Test Helpers

Import from `tests/helpers.ts`:

```ts
import {
  uniqueUser,       // generates unique email per test
  registerUser,     // full UI registration + email verification
  loginUser,        // login via UI
  sendMessage,      // types message, waits for AI response
  openObserver,     // opens observer panel
  sendObserverMessage, // sends observer question, waits for response
  navigateToCourses,// navigates to courses page
  navigateToCourse, // navigates to a specific course
  apiRequest,       // makes API calls with the page's auth cookies
  SEED,             // constants for seed data (course IDs, scenario IDs)
} from './helpers';
```

### Writing an E2E Test

```ts
import { expect, test } from '@playwright/test';
import { loginUser, registerUser, uniqueUser, SEED } from './helpers';

const user = uniqueUser();

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await registerUser(page, user);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await loginUser(page, user);
});

test('can view courses', async ({ page }) => {
  await page.goto('/courses');
  await expect(page.getByText(SEED.courseTitle)).toBeVisible();
});
```

### Auth Patterns

Each spec creates its own users — never share users across spec files:

```ts
// Registration goes through the full UI flow:
// 1. Navigate to /register
// 2. Fill form (name, email, password)
// 3. Submit → redirected to /verify-email
// 4. POST /api/test/verify-email (only works with TEST_MODE=1)
// 5. Sign out and sign back in for a fresh session
await registerUser(page, user);
```

For admin tests, register with an invite code:

```ts
await registerUserWithInviteCode(page, user, process.env.ADMIN_INVITE_CODE);
```

### Testing API Responses

Use `apiRequest()` to make authenticated API calls inside the browser context:

```ts
test('profile API returns user data', async ({ page }) => {
  const profile = await apiRequest(page, 'GET', '/api/user/profile');
  expect(profile.name).toBe(user.name);
});
```

### Waiting for Streaming

`sendMessage()` and `sendObserverMessage()` wait for the streaming indicator to appear then disappear:

```ts
await navigateToCourse(page, SEED.courseTitle);
await page.getByText('Natural Selection with Riley').click();
// First AI message (opening) appears automatically

await sendMessage(page, 'Can you explain that further?');
// Waits up to 120s for streaming to complete

await openObserver(page);
await sendObserverMessage(page, 'How is the student reasoning?');
// Waits up to 60s for observer streaming to complete
```

### Multi-User Tests

Use separate browser contexts for isolation:

```ts
test('user A cannot see user B conversation', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  // ... register and test with each page independently
  await contextA.close();
  await contextB.close();
});
```

### Cleanup

Delete test resources in `afterAll` to avoid polluting the database:

```ts
let courseId: string;

test('create course', async ({ page }) => {
  courseId = await apiRequest(page, 'POST', '/api/admin/courses', { ... });
});

test.afterAll(async ({ browser }) => {
  if (courseId) {
    const page = await browser.newPage();
    await loginUser(page, adminUser);
    await apiRequest(page, 'DELETE', `/api/admin/courses/${courseId}`);
    await page.close();
  }
});
```

## Mock AI Server

`server/ai/mock-server.ts` provides a deterministic OpenAI-compatible API:

- **Port**: 4100 (override with `MOCK_AI_PORT`)
- **`POST /v1/chat/completions`**: Returns 3 rotating canned responses about natural selection. Supports both streaming (word-level SSE chunks with 5ms delay) and non-streaming modes.
- **`GET /v1/models`**: Returns a mock model list including `deepseek-ai/DeepSeek-V3.1`
- **Activation**: Set `MOCK_AI=1`. The AI client (`server/ai/client.ts`) routes to `http://localhost:4100` instead of NEAR AI Cloud.
- **Safety**: Throws if `MOCK_AI=1` in production.

## Debugging Failing Tests

### Run a Single Test File

```bash
# Unit: run one file
bun run test:unit --filter streaming

# E2E: run one spec
bunx playwright test tests/conversation.spec.ts

# E2E: run one test by title
bunx playwright test -g "can send a message"
```

### Verbose Output

```bash
# Unit: Bun shows full diffs by default on failure

# E2E: headed mode (see the browser)
bunx playwright test --headed tests/auth.spec.ts

# E2E: debug mode (step through with inspector)
bunx playwright test --debug tests/auth.spec.ts
```

### Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| `mock.module` not working | Import order — module imported before mock installed | Move `mock.module()` calls above all `import`/`await import()` of the module under test |
| Rate limit 429 in E2E | `TEST_MODE=1` not set | Ensure `TEST_MODE=1` in Playwright config env |
| Stale cache in unit tests | `agentCache` not reset | Call `clearAgentCache()` in `afterEach` |
| SSE test hangs | Stream never closes | Ensure mock response calls `controller.close()` |
| `Date.now` leak between tests | Monkey-patched `Date.now` not restored | Restore in `afterEach`: `Date.now = realDateNow` |

## Running Tests

```bash
# Unit tests only
bun run test:unit

# E2E tests (launches servers automatically)
bun run test

# E2E with interactive UI
bun run test:ui

# Single E2E spec
bunx playwright test tests/conversation.spec.ts

# Type-check test files
bun run type-check
```

## CI Behavior

In `.github/workflows/ci.yml`:
1. **`check` job**: Runs `bun run test:unit` after type-check, lint, and build
2. **`test` job**: Starts mock AI server in background, runs Playwright E2E tests with `MOCK_AI=1` and `TEST_MODE=1`
3. Playwright report uploaded as artifact unless cancelled (7-day retention)

## Key Files

- `playwright.config.ts` — E2E config (timeouts, server launch, browser)
- `tests/global-setup.ts` — Playwright global setup (DB push + seed handled by webServer command)
- `tests/helpers.ts` — Shared E2E utilities (`uniqueUser`, `registerUser`, `sendMessage`, etc.)
- `server/ai/mock-server.ts` — Deterministic mock AI server
- `server/ai/client.ts` — AI client with `MOCK_AI` routing logic
- `server/lib/env.ts` — `TEST_MODE` flag and rate limit multipliers
- `tsconfig.test.json` — TypeScript config for test files

## See Also

- `streaming-endpoint.md` — The streaming patterns these tests verify
- `auth.md` — Auth test patterns (`registerUser`, `TEST_MODE`, invite codes)
- `deployment.md` — CI pipeline configuration and test job details
