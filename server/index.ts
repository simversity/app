import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiReference } from '@scalar/hono-api-reference';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { NEARAI_BASE_URL } from './ai/client';
import { auth } from './auth';
import { db, sqlite } from './db';
import { accessCode, user } from './db/schema';
import { auditLog } from './lib/audit';
import {
  env,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES_PER_CONVERSATION,
  MIN_MESSAGES_TO_COMPLETE,
  RATE_LIMIT_AUTH,
  RATE_LIMIT_CLAIM_ROLE,
  RATE_LIMIT_READ,
} from './lib/env';
import { log } from './lib/logger';
import { createRateLimiter, setRateLimitHeaders } from './lib/rate-limit';
import { getClientIp } from './lib/request';
import { tooManyRequests } from './lib/responses';
import { initGracefulShutdown, isShuttingDown } from './lib/shutdown';
import type { AppEnv } from './lib/types';
import { parseBody } from './lib/validation';
import { requireAuth, requireVerified } from './middleware/auth';
import { adminRoutes } from './routes/admin';
import { fileContentRoutes } from './routes/admin/files';
import { budgetRoutes } from './routes/budget';
import { conversationRoutes } from './routes/conversations';
import { courseRoutes } from './routes/courses';
import { modelRoutes } from './routes/models';
import { progressRoutes } from './routes/progress';
import { scenarioBuilderRoutes } from './routes/scenario-builder';
import { userRoutes } from './routes/user';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});
app.use('*', logger());
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginOpenerPolicy: 'same-origin',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // 'unsafe-inline' required by Tailwind v4 runtime style injection
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  }),
);
app.use('*', async (c, next) => {
  if (isShuttingDown())
    return c.json({ error: 'Server is shutting down' }, 503);
  return next();
});
app.use(
  '/api/*',
  cors({
    origin: env.APP_URL,
    credentials: true,
  }),
);
// Body limits: auth endpoints get a larger limit (Better-Auth needs to parse
// its own body, so we use a separate middleware); all other API routes get 1MB.
const apiBodyLimit = bodyLimit({ maxSize: 1024 * 1024 }); // 1MB
const authBodyLimit = bodyLimit({ maxSize: 256 * 1024 }); // 256KB
const uploadBodyLimit = bodyLimit({ maxSize: 50 * 1024 * 1024 }); // 50MB for file uploads
/** Matches file-upload routes that need a larger body limit. */
const FILE_UPLOAD_PATH =
  /\/api\/(admin\/(courses|scenarios)|conversations)\/[^/]+\/files/;
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return authBodyLimit(c, next);
  if (c.req.method === 'POST' && FILE_UPLOAD_PATH.test(c.req.path))
    return uploadBodyLimit(c, next);
  return apiBodyLimit(c, next);
});

// Rate limiting for auth endpoints (per IP; higher in test mode).
// IP extraction is handled by getClientIp() which respects TRUST_PROXY env var.
const checkAuthRate = createRateLimiter(RATE_LIMIT_AUTH);
const checkReadRate = createRateLimiter(RATE_LIMIT_READ);

// Rate limit GET requests per IP to prevent scraping
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') return next();
  if (c.req.path.startsWith('/api/auth/')) return next();
  if (c.req.path === '/api/health') return next();
  if (c.req.path.startsWith('/api/docs')) return next();
  const ip = getClientIp(c);
  if (!checkReadRate(ip)) {
    setRateLimitHeaders(c, checkReadRate.info(ip));
    return tooManyRequests(c);
  }
  setRateLimitHeaders(c, checkReadRate.info(ip));
  return next();
});

app.all('/api/auth/*', (c) => {
  // Only rate-limit auth mutations (sign-in, sign-up), not session checks
  if (c.req.method === 'POST') {
    const ip = getClientIp(c);
    if (!checkAuthRate(ip)) {
      return tooManyRequests(c);
    }
  }
  return auth.handler(c.req.raw);
});
app.route('/api/courses', courseRoutes);
app.route('/api/conversations', conversationRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/admin', adminRoutes);
app.use('/api/files/*', requireVerified);
app.route('/api/files', fileContentRoutes);
app.route('/api/models', modelRoutes);
app.route('/api/user', userRoutes);
app.route('/api/scenario-builder', scenarioBuilderRoutes);
app.use('/api/budget/*', requireVerified);
app.route('/api/budget', budgetRoutes);

// API documentation (Scalar UI + raw OpenAPI spec)
const openapiSpec = readFileSync(
  resolve(import.meta.dir, '../docs/openapi.yaml'),
  'utf-8',
);
app.get('/api/docs/openapi.yaml', (c) => {
  return c.text(openapiSpec, 200, { 'Content-Type': 'text/yaml' });
});
app.get(
  '/api/docs',
  apiReference({
    url: '/api/docs/openapi.yaml',
    pageTitle: 'Simversity API Reference',
    theme: 'kepler',
  }),
);

app.get('/api/config/registration', (c) => {
  // Only check env-based invite code. Querying the DB for access codes would
  // leak whether DB-based codes exist to unauthenticated users.
  return c.json({ inviteCodeEnabled: !!env.ADMIN_INVITE_CODE });
});

app.get('/api/config/app', (c) => {
  return c.json({
    maxMessageChars: MAX_MESSAGE_CHARS,
    maxMessagesPerConversation: MAX_MESSAGES_PER_CONVERSATION,
    minMessagesToComplete: MIN_MESSAGES_TO_COMPLETE,
  });
});

const claimRoleSchema = z.object({
  inviteCode: z.string().min(1).max(200),
});

const checkClaimRate = createRateLimiter(RATE_LIMIT_CLAIM_ROLE);

app.post('/api/claim-role', requireAuth, async (c) => {
  const currentUser = c.get('user');
  const ip = getClientIp(c);
  // Evaluate both checks before short-circuiting so both counters always increment
  const userLimited = !checkClaimRate(currentUser.id);
  // Skip IP-based rate limit in test mode (all requests share localhost)
  const ipLimited = process.env.TEST_MODE === '1' ? false : !checkClaimRate(ip);
  if (userLimited || ipLimited) {
    auditLog(
      'user.role_claim_failed',
      currentUser.id,
      { reason: 'rate_limited' },
      c.get('requestId'),
    );
    return tooManyRequests(c);
  }

  const parsed = await parseBody(c, claimRoleSchema);
  if ('error' in parsed) return parsed.error;
  const { inviteCode } = parsed.data;

  // 1. Check env var admin invite code (constant-time comparison)
  // Minimum padding prevents timing leaks from short inputs
  const TIMING_SAFE_MIN_LEN = 64;
  if (env.ADMIN_INVITE_CODE) {
    const padLen = Math.max(
      inviteCode.length,
      env.ADMIN_INVITE_CODE.length,
      TIMING_SAFE_MIN_LEN,
    );
    const a = Buffer.from(inviteCode.padEnd(padLen, '\0'));
    const b = Buffer.from(env.ADMIN_INVITE_CODE.padEnd(padLen, '\0'));
    const match = timingSafeEqual(a, b);
    if (match) {
      await db
        .update(user)
        .set({ role: 'admin' })
        .where(eq(user.id, currentUser.id));
      auditLog(
        'user.role_claim',
        currentUser.id,
        {
          role: 'admin',
          method: 'env_invite_code',
        },
        c.get('requestId'),
      );
      return c.json({ success: true, role: 'admin' });
    }
  }

  // 2. Check access codes table (transaction to prevent TOCTOU race)
  const result = await db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(accessCode)
      .where(and(eq(accessCode.code, inviteCode), isNull(accessCode.usedBy)));

    if (!code) return { error: 'Invalid invite code', status: 403 as const };

    if (code.role !== 'admin') {
      return {
        error: 'Invalid access code configuration',
        status: 403 as const,
      };
    }

    if (code.expiresAt && code.expiresAt < new Date()) {
      return { error: 'Invite code has expired', status: 403 as const };
    }

    // Atomically claim: re-check usedBy IS NULL and expiry in WHERE to prevent
    // TOCTOU race where a code expires between the check above and this update.
    const [claimed] = await tx
      .update(accessCode)
      .set({ usedBy: currentUser.id, usedAt: new Date() })
      .where(
        and(
          eq(accessCode.id, code.id),
          isNull(accessCode.usedBy),
          or(
            isNull(accessCode.expiresAt),
            gt(accessCode.expiresAt, new Date()),
          ),
        ),
      )
      .returning();

    if (!claimed)
      return { error: 'Code already used or expired', status: 409 as const };

    await tx
      .update(user)
      .set({ role: code.role })
      .where(eq(user.id, currentUser.id));

    return { success: true, role: code.role };
  });

  if ('error' in result) {
    auditLog(
      'user.role_claim_failed',
      currentUser.id,
      { reason: result.error, status: result.status },
      c.get('requestId'),
    );
    return c.json({ error: result.error }, result.status);
  }

  auditLog(
    'user.role_claim',
    currentUser.id,
    {
      role: result.role,
      method: 'access_code',
    },
    c.get('requestId'),
  );

  return c.json(result);
});

// Test-only: mark the current user's email as verified (guarded by TEST_MODE)
if (process.env.TEST_MODE === '1') {
  app.post('/api/test/verify-email', requireAuth, async (c) => {
    const currentUser = c.get('user');
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, currentUser.id));
    return c.json({ ok: true });
  });
}

// Cached AI health check
let aiHealthCache: {
  status: 'ok' | 'degraded' | 'unreachable';
  checkedAt: number;
} = {
  status: 'unreachable',
  checkedAt: 0,
};
const AI_HEALTH_CACHE_MS = 60_000;

async function checkAIHealth(): Promise<'ok' | 'degraded' | 'unreachable'> {
  if (process.env.MOCK_AI === '1') return 'ok';
  if (Date.now() - aiHealthCache.checkedAt < AI_HEALTH_CACHE_MS) {
    return aiHealthCache.status;
  }
  try {
    const res = await fetch(`${NEARAI_BASE_URL}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    aiHealthCache = {
      status: res.ok ? 'ok' : 'degraded',
      checkedAt: Date.now(),
    };
  } catch {
    aiHealthCache = { status: 'unreachable', checkedAt: Date.now() };
  }
  return aiHealthCache.status;
}

app.get('/api/health', async (c) => {
  if (isShuttingDown()) {
    return c.json({ status: 'shutting_down' }, 503);
  }
  try {
    const result = sqlite.query('SELECT 1 AS ok').get() as {
      ok: number;
    } | null;
    if (result?.ok !== 1) throw new Error('DB check failed');
    const ai = await checkAIHealth();
    return c.json({ status: 'ok', ai });
  } catch {
    return c.json({ status: 'error', detail: 'Database unreachable' }, 503);
  }
});

// Cache hashed static assets aggressively (Rsbuild outputs to /static/)
app.use('/static/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
});
// Serve frontend static assets (production)
app.use('/*', serveStatic({ root: './dist' }));
// SPA fallback — serve index.html for all non-API, non-static routes
app.get('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-cache');
});
app.get('*', serveStatic({ path: './dist/index.html' }));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  // User/requestId may not be set if the error occurred before middleware ran
  let userId: string | undefined;
  let requestId: string | undefined;
  try {
    userId = c.get('user')?.id;
    requestId = c.get('requestId');
  } catch {
    // Variables not set yet — leave as undefined
  }
  log.error(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      error: err.message,
      stack: err.stack,
      userId: userId || 'anonymous',
    },
    'Unhandled request error',
  );
  return c.json({ error: 'Internal server error' }, 500);
});

// Start server with graceful shutdown
const server = Bun.serve({
  port: env.PORT,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  idleTimeout: 90, // seconds — aligned with 60s streaming inactivity timeout
});

initGracefulShutdown(server, sqlite);

if (process.env.NODE_ENV === 'production' && env.TRUST_PROXY === '0') {
  log.warn(
    'TRUST_PROXY is not set — all rate limits will share a single IP bucket if behind a reverse proxy',
  );
}

log.info({ port: server.port }, 'Server listening');
