# Simversity

### Teaching Simulator

> React 19 / Hono / SQLite / NEAR AI Cloud

AI-powered teaching simulator where educators practice responding to undergraduate students who hold common misconceptions. An observer provides research-grounded qualitative feedback on instructional moves — no numeric scoring.

## Features

- **AI Student Personas** — Configurable student agents with system prompts, misconceptions, and distinct personalities
- **Real-time Conversations** — SSE-streamed chat between educator and AI student
- **Observer Feedback** — Mid-conversation and post-conversation qualitative feedback from an AI observer
- **Course & Scenario Management** — Admin CRUD for courses, scenarios, personas, and model selection
- **Access Code System** — Invite-code-based registration with role assignment (teacher/admin)
- **Progress Tracking** — Per-user conversation history and stats dashboard
- **Multi-model Support** — Select from DeepSeek, Claude, GPT, Gemini, Qwen, and more via NEAR AI Cloud

## Architecture

```
Browser                          Server (Hono/Bun :3001)
┌──────────────────────┐         ┌──────────────────────┐
│ React 19             │         │ API Routes (/api/*)  │
│ TanStack Router      │  SSE    │ Better-Auth          │
│ TanStack Query       │◄──────► │ Drizzle ORM (SQLite) │
│ Tailwind v4          │         │ NEAR AI Cloud        │
│ shadcn/ui            │         │ (OpenAI SDK)         │
└──────────────────────┘         └──────────────────────┘
```

- **Frontend** (port 3000): Rsbuild dev server proxies `/api` to backend
- **Backend** (port 3001): Hono on Bun. SQLite via Drizzle ORM
- **AI**: NEAR AI Cloud (OpenAI-compatible). Default model: DeepSeek V3.1
- **Auth**: Better-Auth (email/password) with access-code-gated registration

## Setup

Install dependencies:

```bash
bun install
bun run prepare  # install git hooks (Lefthook)
```

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `BETTER_AUTH_SECRET` | Session secret. Run `openssl rand -hex 32` to generate |
| `NEARAI_API_KEY` | API key from https://cloud.near.ai/api-keys |

See [AGENTS.md → NEAR AI Cloud](AGENTS.md#near-ai-cloud) for the full list of optional environment variables.

Initialize the database and seed scenarios:

```bash
bun run db:push
bun run db:seed
```

## Development

Start the dev servers. The app will be available at [http://localhost:3000](http://localhost:3000).

```bash
# Both frontend + backend in one terminal
bun run dev

# Or run them separately
bun run dev:ui    # Frontend only (port 3000)
bun run dev:api   # Backend only (port 3001)
```

## Testing

```bash
# Unit tests (Bun test runner) — NEVER use bare `bun test`
bun run test:unit

# E2E tests (Playwright — launches servers automatically)
bun run test

# E2E tests with interactive UI
bun run test:ui
```

E2E tests require `MOCK_AI=1` and `TEST_MODE=1` (set automatically in CI). For local runs, set `MOCK_AI=1` in `.env` or provide a real `NEARAI_API_KEY`. See [docs/skills/testing.md](docs/skills/testing.md) for details.

## Production

Build and preview locally:

```bash
bun run build
bun run preview
```

### Docker

```bash
docker build -t simversity .
docker run -p 3001:3001 \
  -v simversity-data:/data \
  -e BETTER_AUTH_SECRET=your-secret \
  -e NEARAI_API_KEY=your-key \
  simversity
```

The `-v` flag mounts a persistent volume for the SQLite database. On first run, seed the database: `docker exec <container> bun run db:seed`.

For Railway deployment, see [docs/skills/deployment.md](docs/skills/deployment.md).

## Documentation

- [AGENTS.md](AGENTS.md) — Architecture, key files, conventions, and NEAR AI Cloud setup
- [Architecture Decision Records](docs/adr/)
  - [ADR 001: SSE over WebSocket](docs/adr/001-sse-over-websocket.md)
  - [ADR 002: SQLite over PostgreSQL](docs/adr/002-sqlite-over-postgres.md)
  - [ADR 003: No global state store](docs/adr/003-no-global-state-store.md)
  - [ADR 004: NEAR AI Cloud](docs/adr/004-near-ai-cloud.md)
  - [ADR 005: Bun as runtime](docs/adr/005-bun-runtime.md)
  - [ADR 006: Sequential multi-agent](docs/adr/006-sequential-multi-agent.md)
  - [ADR 007: In-process rate limiting](docs/adr/007-in-process-rate-limiting.md)
- Skill Guides
  - [Adding a Route](docs/skills/add-route.md) — End-to-end guide for new API + page
  - [Adding a Scenario](docs/skills/add-scenario.md) — Creating AI student personas
  - [Auth](docs/skills/auth.md) — Three-tier middleware and invite codes
  - [Streaming Endpoints](docs/skills/streaming-endpoint.md) — SSE streaming patterns
  - [Testing](docs/skills/testing.md) — Unit tests (Bun) and E2E tests (Playwright)
  - [Deployment](docs/skills/deployment.md) — Docker, Railway, production config
- [API Spec](docs/openapi.yaml) — OpenAPI 3.1 specification

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run `bun run check` — Biome lint must pass (single quotes, 2-space indent)
4. Run `bun run type-check` — all three tsconfig projects must pass
5. Run `bun run test:unit` — unit tests must pass
6. Open a PR

### Code style

See [AGENTS.md → Conventions](AGENTS.md#conventions) for the full list of code style and project conventions.

## License

[MIT](LICENSE)
