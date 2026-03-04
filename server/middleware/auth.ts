import type { Context, Next } from 'hono';
import { auth } from '../auth';
import { UserRole } from '../lib/constants';
import { findUserConversation } from '../lib/conversation-helpers';
import type { AppUser } from '../lib/types';
import { parseUUID } from '../lib/validation';

async function getSessionOrFail(
  c: Context,
): Promise<{ user: AppUser; emailVerified: boolean } | null> {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) return null;

  // Better-Auth's inferred type doesn't include additionalFields, so widen it
  const sessionUser = session.user as typeof session.user & { role?: string };

  // Validate role at runtime before narrowing
  const validRoles: string[] = Object.values(UserRole);
  if (!sessionUser.role || !validRoles.includes(sessionUser.role)) return null;

  const user: AppUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.role as AppUser['role'],
  };
  c.set('user', user);
  c.set('session', session.session);
  return { user, emailVerified: !!sessionUser.emailVerified };
}

export async function requireAuth(c: Context, next: Next) {
  const result = await getSessionOrFail(c);
  if (!result) return c.json({ error: 'Unauthorized' }, 401);
  await next();
}

/**
 * Like requireAuth, but also checks that the user's email is verified.
 * Use this for routes that should not be accessible with an unverified account.
 */
export async function requireVerified(c: Context, next: Next) {
  const result = await getSessionOrFail(c);
  if (!result) return c.json({ error: 'Unauthorized' }, 401);
  if (!result.emailVerified) {
    return c.json({ error: 'Email not verified' }, 403);
  }
  await next();
}

/**
 * Middleware that verifies auth + email, then loads the conversation
 * from `:id` and checks ownership. Sets `c.get('conversation')` on success.
 * Prevents IDOR by centralizing the ownership check.
 */
export async function requireConversationOwner(c: Context, next: Next) {
  const result = await getSessionOrFail(c);
  if (!result) return c.json({ error: 'Unauthorized' }, 401);
  if (!result.emailVerified) {
    return c.json({ error: 'Email not verified' }, 403);
  }
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const conv = await findUserConversation(parsed.id, result.user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);
  c.set('conversation', conv);
  await next();
}

// admin and super_admin are treated equivalently for all admin routes.
// super_admin exists as a seed-only role for the initial user; it has no
// additional privileges beyond what admin has.
export async function requireAdmin(c: Context, next: Next) {
  const result = await getSessionOrFail(c);
  if (!result) return c.json({ error: 'Unauthorized' }, 401);
  if (!result.emailVerified) {
    return c.json({ error: 'Email not verified' }, 403);
  }
  if (
    result.user.role !== UserRole.ADMIN &&
    result.user.role !== UserRole.SUPER_ADMIN
  ) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
}
