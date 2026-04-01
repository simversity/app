import { verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { db } from '../db';
import { account, user, verification } from '../db/schema';
import { auditLog } from '../lib/audit';
import { RATE_LIMIT_ADMIN } from '../lib/env';
import { createRateLimiter } from '../lib/rate-limit';
import { tooManyRequests } from '../lib/responses';
import type { AppEnv } from '../lib/types';
import { buildUpdateSet } from '../lib/utils';
import { hasUpdateFields, parseBody } from '../lib/validation';
import { requireVerified } from '../middleware/auth';

const checkProfileRateLimit = createRateLimiter(RATE_LIMIT_ADMIN);

const updateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  gradeLevel: z.string().max(100).nullable().optional(),
  subjects: z.string().max(1000).nullable().optional(),
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
});

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', requireVerified);

userRoutes.get('/profile', async (c) => {
  const currentUser = c.get('user');

  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      gradeLevel: user.gradeLevel,
      subjects: user.subjects,
      experienceYears: user.experienceYears,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, currentUser.id));

  if (!profile) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ profile });
});

userRoutes.patch('/profile', async (c) => {
  const currentUser = c.get('user');
  if (!checkProfileRateLimit(currentUser.id)) {
    return tooManyRequests(c);
  }
  const result = await parseBody(c, updateProfileSchema);
  if ('error' in result) return result.error;
  const { name, gradeLevel, subjects, experienceYears } = result.data;

  if (!hasUpdateFields(result.data)) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const updates = buildUpdateSet({
    name,
    gradeLevel,
    subjects,
    experienceYears,
  });

  const [updated] = await db
    .update(user)
    .set(updates)
    .where(eq(user.id, currentUser.id))
    .returning({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      gradeLevel: user.gradeLevel,
      subjects: user.subjects,
      experienceYears: user.experienceYears,
      createdAt: user.createdAt,
    });

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ profile: updated });
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

userRoutes.post('/delete-account', async (c) => {
  const currentUser = c.get('user');

  if (!checkProfileRateLimit(currentUser.id)) {
    return tooManyRequests(c);
  }

  const result = await parseBody(c, deleteAccountSchema);
  if ('error' in result) return result.error;
  const { password } = result.data;

  // Look up the credential account for this user
  const [acct] = await db
    .select({ password: account.password })
    .from(account)
    .where(
      and(
        eq(account.userId, currentUser.id),
        eq(account.providerId, 'credential'),
      ),
    );

  if (!acct?.password) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const valid = await verifyPassword({
    hash: acct.password,
    password,
  });

  if (!valid) {
    return c.json({ error: 'Incorrect password' }, 403);
  }

  auditLog(
    'user.delete',
    currentUser.id,
    { email: currentUser.email },
    c.get('requestId'),
  );

  // Wrap in a transaction so verification cleanup and user deletion
  // are atomic — if either fails, neither takes effect.
  await db.transaction(async (tx) => {
    // Clean up verification tokens (email verification, password reset)
    // which are keyed by email, not userId, so CASCADE doesn't cover them.
    await tx
      .delete(verification)
      .where(eq(verification.identifier, currentUser.email));

    // Cascade deletes handle sessions, accounts, conversations,
    // messages, progress, files, dailyBudget.
    // Personas and accessCodes.usedBy are set to NULL.
    await tx.delete(user).where(eq(user.id, currentUser.id));
  });

  // Clear the session cookie so the client is immediately logged out.
  deleteCookie(c, 'simversity.session_token', { path: '/' });

  return c.json({ success: true });
});
