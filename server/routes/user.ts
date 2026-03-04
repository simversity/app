import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { user } from '../db/schema';
import { RATE_LIMIT_ADMIN } from '../lib/env';
import { createRateLimiter } from '../lib/rate-limit';
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
    return c.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
    );
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
