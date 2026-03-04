# Authentication and Authorization

How the auth system works: Better-Auth setup, middleware tiers, invite codes, rate limiting, and frontend integration.

## Overview

| Layer | Technology | Config |
|---|---|---|
| Auth framework | Better-Auth (email/password) | `server/auth.ts` |
| Session storage | SQLite via Drizzle | `user`, `session`, `account`, `verification` tables |
| Middleware | Three tiers: `requireAuth`, `requireVerified`, `requireAdmin` | `server/middleware/auth.ts` |
| Role system | `teacher` (default), `admin`, `super_admin` | `server/lib/constants.ts` |
| Frontend | `useSession()` hook from Better-Auth React client | `src/lib/auth-client.ts` |

## Middleware Tiers

Three exported middleware functions from `server/middleware/auth.ts`, from least to most restrictive:

### `requireAuth`

Checks that the user has a valid session. Use for read-only routes where unverified email is acceptable.

```ts
import { requireAuth } from '../middleware/auth';

routes.use('*', requireAuth);
// c.get('user') → AppUser { id, name, email, role }
```

Returns `401 { error: 'Unauthorized' }` if no valid session.

### `requireVerified`

Checks session **and** verified email. Use for routes that modify data or consume AI resources. **This is the default for most routes.**

```ts
import { requireVerified } from '../middleware/auth';

routes.use('*', requireVerified);
```

Returns `401` if no session, `403 { error: 'Email not verified' }` if email unverified.

### `requireAdmin`

Checks session, verified email, **and** role is `admin` or `super_admin`. Use for admin CRUD operations.

```ts
import { requireAdmin } from '../middleware/auth';

routes.use('*', requireAdmin);
```

Returns `401` if no session, `403` if unverified or non-admin role.

### Which Middleware to Use

| Endpoint Type | Middleware | Examples |
|---|---|---|
| Read-only, non-sensitive | `requireAuth` | Profile read, session check |
| Data modification, AI consumption | `requireVerified` | Send message, start conversation, update profile |
| Admin CRUD | `requireAdmin` | Create/edit/delete courses, scenarios, personas, access codes |

## Role System

Three roles defined in `server/lib/constants.ts`:

```ts
export const UserRole = {
  TEACHER: 'teacher',    // Default for all new users
  ADMIN: 'admin',        // Can manage courses, scenarios, personas, access codes
  SUPER_ADMIN: 'super_admin', // Seed-only, treated same as admin
} as const;
```

- `admin` and `super_admin` are functionally equivalent — `requireAdmin` accepts both
- `super_admin` exists only for the seed script's initial user promotion
- Roles are stored in the `user.role` column with a CHECK constraint

## Invite Code System

Users can upgrade their role via `POST /api/claim-role`. Two code sources are checked in order:

### 1. Environment Variable Code

```
ADMIN_INVITE_CODE=your-secret-code
```

- Compared using `timingSafeEqual()` (constant-time, prevents timing attacks)
- Both strings padded to 256 chars before comparison
- Always grants `admin` role
- Reusable — any number of users can claim it

### 2. Database Access Codes

The `accessCode` table stores single-use invite codes:

```
id          TEXT PK (auto UUID)
code        TEXT NOT NULL UNIQUE
role        TEXT NOT NULL DEFAULT 'teacher' (CHECK: teacher, admin)
createdBy   TEXT FK → user
usedBy      TEXT FK → user (NULL until claimed)
usedAt      TIMESTAMP (NULL until claimed)
expiresAt   TIMESTAMP (NULL = never expires)
```

Claim flow (inside a transaction to prevent TOCTOU races):
1. Query for matching code where `usedBy IS NULL`
2. Validate role is in allowed set
3. Check expiry if set
4. Atomically UPDATE the code (SET `usedBy`, `usedAt`) with a WHERE clause that re-checks `usedBy IS NULL` and expiry — if 0 rows updated, code was already claimed (409)
5. Update user's role

### Rate Limiting

`POST /api/claim-role` is rate-limited at 5 attempts/minute per user **and** per IP (both counters always increment, no short-circuit).

## Session Configuration

Configured in `server/auth.ts`:

| Setting | Value |
|---|---|
| Session expiry | 7 days |
| Update age | 1 day (refresh session if older) |
| Cookie cache | 5 minutes |
| Cookie prefix | `simversity` |
| Secure cookies | Production only |
| httpOnly | Yes |
| sameSite | `lax` |
| Trusted origins | `APP_URL` only |
| Password length | 8-128 characters |
| On sign-up | Revoke other sessions |

## Email Verification

- Verification email sent automatically on sign-up
- Uses Resend SDK (`server/lib/email.ts`) when `RESEND_API_KEY` is set
- Falls back to console logging when API key is missing (dev mode)
- `autoSignInAfterVerification: true` — user is logged in after clicking the link
- Password reset also uses the email system

### Test Mode

When `TEST_MODE=1`, a special endpoint is available:

```
POST /api/test/verify-email
```

Immediately marks the authenticated user's email as verified. Guarded by `requireAuth`. Throws if used in production.

## Frontend Integration

### Auth Client

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({});
export const { signIn, signUp, signOut, useSession } = authClient;
```

### Using Session Data

```tsx
import { useSession } from '@/lib/auth-client';

function MyComponent() {
  const { data: session } = useSession();
  // session.user: { id, name, email, emailVerified, role, image }
}
```

### Registration Config

The frontend checks whether invite codes are enabled:

```
GET /api/config/registration → { inviteCodeEnabled: boolean }
```

This only reflects whether `ADMIN_INVITE_CODE` env var is set — it doesn't expose DB access codes.

## Auth Rate Limits

| Endpoint | Limit | Test Mode |
|---|---|---|
| `POST /api/auth/*` (sign-in, sign-up) | 10/min per IP | 100/min |
| `POST /api/claim-role` | 5/min per user + IP | 5/min (unchanged) |
| `GET` requests (session checks) | 100/min per IP | 500/min |

Rate limiting is per-IP for auth mutations. `GET /api/auth/*` (session validation) is not rate-limited.

## AppUser Type

All middleware sets `c.get('user')` to this type (from `server/lib/types.ts`):

```ts
export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'teacher' | 'admin' | 'super_admin';
};
```

Access it in route handlers:

```ts
const user = c.get('user'); // typed via Hono<AppEnv>
```

## Key Files

- `server/auth.ts` — Better-Auth configuration (plugins, session, email callbacks)
- `server/middleware/auth.ts` — `requireAuth`, `requireVerified`, `requireAdmin` middleware
- `server/lib/types.ts` — `AppUser`, `AppEnv` type definitions
- `server/lib/constants.ts` — `UserRole` enum
- `server/lib/email.ts` — Resend email sending (verification + password reset)
- `server/lib/rate-limit.ts` — `createRateLimiter()` factory
- `server/index.ts` — Auth route mounting, `/api/claim-role`, rate limiting setup
- `server/db/schema.ts` — `user`, `session`, `account`, `verification`, `accessCode` tables
- `src/lib/auth-client.ts` — Frontend `signIn`, `signUp`, `signOut`, `useSession`

## See Also

- `add-route.md` — How to apply auth middleware to new routes
- `testing.md` — E2E auth patterns (`registerUser`, `loginUser`, `TEST_MODE`)
