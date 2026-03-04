# Adding a New Page and API Route

End-to-end guide for adding a feature with backend API and frontend page.

## Backend

### 1. Create Route File

Create `server/routes/myfeature.ts`:

```ts
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { myTable } from '../db/schema';
import type { AppEnv } from '../lib/types';
import { requireVerified } from '../middleware/auth';

export const myFeatureRoutes = new Hono<AppEnv>();

myFeatureRoutes.use('*', requireVerified);

// GET /api/myfeature
myFeatureRoutes.get('/', async (c) => {
  const user = c.get('user');
  const items = await db.select().from(myTable).where(eq(myTable.userId, user.id));
  return c.json({ items });
});

// POST /api/myfeature
const createSchema = z.object({
  name: z.string().min(1).max(200),
});

myFeatureRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request: name is required' }, 400);
  }

  const item = {
    id: crypto.randomUUID(),
    userId: user.id,
    name: parsed.data.name,
  };
  await db.insert(myTable).values(item);
  return c.json(item, 201);
});
```

### 2. Mount in Server

Add to `server/index.ts`:

```ts
import { myFeatureRoutes } from './routes/myfeature';

app.route('/api/myfeature', myFeatureRoutes);
```

### 3. Update OpenAPI Spec

Add your new endpoint to `docs/openapi.yaml`. CI validates the spec against the running server, so missing endpoints will fail the build.

Include: path, method, tags, summary, security, request body schema (if any), and response schemas.

### 4. Database Schema (if needed)

Add table to `server/db/schema.ts`:

```ts
export const myTable = t.sqliteTable('my_table', {
  id: t.text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: t.text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: t.text('name').notNull(),
  createdAt: t.integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

Add relations:

```ts
export const myTableRelations = relations(myTable, ({ one }) => ({
  user: one(user, { fields: [myTable.userId], references: [user.id] }),
}));
```

Generate and apply migration:

```bash
bun run db:generate && bun run db:push
```

## Frontend

### 5. Create Route File

Create `src/routes/_app/myfeature.tsx` for a protected page:

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/myfeature')({
  component: MyFeaturePage,
});

function MyFeaturePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">My Feature</h1>
    </div>
  );
}
```

TanStack Router auto-generates `src/routeTree.gen.ts` — never edit it manually.

### 6. Route with Dynamic Params

For `src/routes/_app/myfeature/$itemId.tsx`:

```tsx
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/myfeature/$itemId')({
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { itemId } = useParams({ from: '/_app/myfeature/$itemId' });
  // Fetch and render...
}
```

### 7. Data Fetching

Use `useQuery()` from `@tanstack/react-query` with `apiFetch()` from `src/lib/api.ts`. Query keys are centralized in `src/lib/query-keys.ts`.

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

type MyFeatureData = { items: Array<{ id: string; name: string }> };

function MyFeaturePage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['myfeature'],
    queryFn: () => apiFetch<MyFeatureData>('/api/myfeature'),
  });

  if (isPending) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  // render data.items...
}
```

For mutations (POST/PATCH/DELETE), use `useMutation()` from `@tanstack/react-query` with `apiMutate()` from `src/lib/api.ts`. Invalidate related queries on success:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiMutate } from '@/lib/api';

const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (body: { name: string }) =>
    apiMutate('/api/myfeature', { body }),
  onSuccess() {
    queryClient.invalidateQueries({ queryKey: ['myfeature'] });
  },
});
```

### 8. Add Navigation Link

Edit `src/components/layout/Sidebar.tsx` to add a nav item.

## Conventions

- **Validation**: Zod schemas with `.safeParse()`. Return `{ error: string }` on failure. Use `parseBody()` from `server/lib/validation.ts` to combine JSON parsing + Zod validation in one call.
- **IDs**: `crypto.randomUUID()` for text primary keys.
- **Auth**: `requireVerified` middleware + `c.get('user')` (typed via `Hono<AppEnv>` from `server/lib/types.ts`). Use `requireAuth` for read-only routes where unverified users are acceptable. For admin routes, use `requireAdmin` from `server/middleware/auth.ts`.
- **Error responses**: `c.json({ error: '...' }, 4xx)` for expected failures.
- **Multi-step mutations**: Wrap in `db.transaction()`.
- **UI components**: Check `src/components/ui/` for existing shadcn/ui components before creating new ones. Add with `bunx shadcn@latest add <component>`.
- **Imports**: Use `@/` alias for frontend src imports.
- **Linting**: Run `bun run check` when done.

## Key Files

- `server/index.ts` — Mount routes
- `server/db/schema.ts` — Database schema and relations
- `server/middleware/auth.ts` — `requireAuth`, `requireVerified`, `requireAdmin` middleware
- `server/lib/types.ts` — `AppEnv`, `AppUser` types
- `server/lib/rate-limit.ts` — `createRateLimiter()` rate limiting utility
- `src/routes/_app/` — Protected page routes
- `src/lib/query-client.ts` — TanStack Query client with global error handlers
- `src/lib/query-keys.ts` — Centralized query key factory
- `src/lib/api.ts` — `apiFetch()`, `apiMutate()` helpers (handle `credentials: 'include'`)
- `src/components/ui/` — Existing UI components
- `server/lib/validation.ts` — `parseBody()`, `parseUUID()`, `escapeRegex()`, `requireUUID()` middleware
- `src/components/layout/Sidebar.tsx` — Navigation

## See Also

- `streaming-endpoint.md` — For SSE streaming endpoints (real-time AI responses)
- `auth.md` — Deep dive on `requireAuth` vs `requireVerified` vs `requireAdmin` and invite codes
- `testing.md` — Write unit tests for your new route handler
- `docs/openapi.yaml` — API spec (CI validates drift)
