import { z } from 'zod';

// Railway sets RAILWAY_VOLUME_MOUNT_PATH when a volume is attached
const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;

const appUrl = (
  process.env.APP_URL ||
  (railwayDomain ? `https://${railwayDomain}` : 'http://localhost:3000')
).replace(/\/+$/, '');

export const MAX_CONTEXT_MESSAGES = 50;
export const MAX_OBSERVER_CONTEXT = 20;
export {
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES_PER_CONVERSATION,
  MIN_MESSAGES_TO_COMPLETE,
} from './constants';
export const POST_CONVERSATION_MAX_TOKENS = 2000;
/** Mid-conversation observer responses should be concise coaching nudges. */
export const MID_CONVERSATION_MAX_TOKENS = 800;

// Timeout constants (milliseconds)
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const SHUTDOWN_GRACE_MS = 30_000;

const isTestMode = process.env.TEST_MODE === '1';

if (isTestMode && process.env.NODE_ENV === 'production') {
  throw new Error('TEST_MODE must not be enabled in production');
}

// Per-endpoint rate limits (requests per minute)
export const RATE_LIMIT_AUTH = isTestMode ? 100 : 10; // per IP
export const RATE_LIMIT_MESSAGES = isTestMode ? 200 : 20; // per user — conversation messages
export const RATE_LIMIT_START_CONVERSATION = isTestMode ? 100 : 5; // per user — new conversations
export const RATE_LIMIT_OBSERVER = isTestMode ? 100 : 10; // per user — observer messages
export const RATE_LIMIT_CLAIM_ROLE = 5; // per user — invite code attempts
export const RATE_LIMIT_ADMIN = isTestMode ? 200 : 60; // per user — admin operations
export const RATE_LIMIT_READ = isTestMode ? 500 : 100; // per user — GET requests

// Optional comma-separated allowlist of model IDs. Empty = allow all.
export const MODEL_ALLOWLIST: string[] = (() => {
  const v = process.env.MODEL_ALLOWLIST;
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();

// Daily message budget (all AI message types combined).
// Positive number = limit per user per day. 0 or unset = unlimited.
// Negative values are treated as unlimited (backwards compat).
export const DAILY_MESSAGE_LIMIT = (() => {
  const v = process.env.DAILY_MESSAGE_LIMIT;
  if (!v) return 0;
  const parsed = Number.parseInt(v, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
})();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().url(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(
        32,
        'BETTER_AUTH_SECRET must be at least 32 characters — run: openssl rand -hex 32',
      ),
    BETTER_AUTH_URL: z.string().url(),
    NEARAI_API_KEY:
      process.env.MOCK_AI === '1'
        ? z.string()
        : z.string().min(1, 'NEARAI_API_KEY is required'),
    NEARAI_MODEL: z.string().min(1),
    NEARAI_MAX_TOKENS: z.number().int().positive().max(10_000),
    ADMIN_INVITE_CODE: z.string(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    TRUST_PROXY: z.enum(['0', '1']).optional().default('0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .refine((data) => !data.RESEND_API_KEY || data.EMAIL_FROM, {
    message:
      'EMAIL_FROM is required when RESEND_API_KEY is set — e.g. EMAIL_FROM="Simversity <noreply@yourdomain.com>"',
    path: ['EMAIL_FROM'],
  })
  .refine(
    (data) =>
      process.env.NODE_ENV !== 'production' ||
      data.APP_URL.startsWith('https://'),
    {
      message: 'APP_URL must use HTTPS in production',
      path: ['APP_URL'],
    },
  )
  .refine(
    (data) =>
      process.env.NODE_ENV !== 'production' ||
      !/^[A-Za-z_-]+$/.test(data.BETTER_AUTH_SECRET),
    {
      message:
        'BETTER_AUTH_SECRET looks like a placeholder — run: openssl rand -hex 32',
      path: ['BETTER_AUTH_SECRET'],
    },
  )
  .refine(
    (data) => process.env.NODE_ENV !== 'production' || data.RESEND_API_KEY,
    {
      message:
        'RESEND_API_KEY is required in production for email verification and password reset',
      path: ['RESEND_API_KEY'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export const env: Env = (() => {
  const raw = {
    DATABASE_URL:
      process.env.DATABASE_URL ||
      (volumePath ? `${volumePath}/sqlite.db` : 'sqlite.db'),
    APP_URL: appUrl,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || '',
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || appUrl,
    NEARAI_API_KEY: process.env.NEARAI_API_KEY || '',
    NEARAI_MODEL: process.env.NEARAI_MODEL || 'deepseek-ai/DeepSeek-V3.1',
    NEARAI_MAX_TOKENS: (() => {
      const v = process.env.NEARAI_MAX_TOKENS;
      if (!v) return 500;
      const parsed = Number.parseInt(v, 10);
      return Number.isNaN(parsed) ? 500 : parsed;
    })(),
    ADMIN_INVITE_CODE: process.env.ADMIN_INVITE_CODE || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    TRUST_PROXY: process.env.TRUST_PROXY || '0',
    PORT: process.env.PORT || undefined,
  };

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }
  return result.data;
})();
