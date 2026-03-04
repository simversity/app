import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { z } from 'zod';
import { db } from './db';
import { sendEmail } from './lib/email';
import { env } from './lib/env';
import { log } from './lib/logger';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeOtherSessions: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Simversity password',
          text: `Click the link to reset your password: ${url}`,
        });
      } catch (err) {
        log.error(
          {
            event: 'email_send_failed',
            purpose: 'password_reset',
            to: user.email,
            error: err instanceof Error ? err.message : String(err),
          },
          'Failed to send password reset email',
        );
        throw err;
      }
    },
  },
  user: {
    additionalFields: {
      subjects: {
        type: 'string',
        required: false,
        input: true,
        validator: { input: z.string().max(1000) },
      },
      experienceYears: {
        type: 'number',
        required: false,
        input: true,
        validator: { input: z.number().int().min(0).max(80) },
      },
      role: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: 'teacher',
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session if older than 1 day
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    cookiePrefix: 'simversity',
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      httpOnly: true,
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Verify your Simversity email',
          text: `Click the link to verify your email: ${url}`,
        });
      } catch (err) {
        log.error(
          {
            event: 'email_send_failed',
            purpose: 'email_verification',
            to: user.email,
            error: err instanceof Error ? err.message : String(err),
          },
          'Failed to send verification email',
        );
        throw err;
      }
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  trustedOrigins: [env.APP_URL],
});
