import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Seed data constants — keep in sync with server/ai/scenarios.ts
export const SEED = {
  courseId: '7396326e-361c-45f3-a34a-e69e26893ee7',
  courseTitle: 'Natural Selection Scenarios',
  scenarioCount: 2,
  rileyScenarioId: '49cbff13-46ed-43fe-b2e1-6f5bcb6c9dbf',
  rileyPersonaName: 'riley',
  samOpeningFragment: 'population shifted',
  rileyOpeningFragment: 'turned white',
  maxMessageLength: 5000,
} as const;

let userCounter = 0;

export function uniqueUser() {
  userCounter++;
  const ts = Date.now();
  return {
    name: `Test User ${userCounter}`,
    email: `testuser${userCounter}_${ts}@test.com`,
    password: 'TestPass1234',
  };
}

/**
 * Programmatically mark the current session user's email as verified.
 * Only works when the server is running with TEST_MODE=1.
 */
export async function verifyEmail(page: Page) {
  const res = await apiRequest(page, 'POST', '/api/test/verify-email');
  if (res.status !== 200) {
    throw new Error(`Failed to verify email: ${JSON.stringify(res)}`);
  }
}

export async function registerUser(
  page: Page,
  user: { name: string; email: string; password: string },
) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/verify-email', { timeout: 15000 });
  await verifyEmail(page);
  // Sign out and back in to get a fresh session with emailVerified: true
  // (bypasses Better-Auth's server-side cookie cache)
  await signOutAndIn(page, user);
}

export async function registerUserWithInviteCode(
  page: Page,
  user: { name: string; email: string; password: string },
  inviteCode: string,
) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);

  // The invite code field may or may not be visible depending on config
  const inviteField = page.getByLabel('Invite code');
  if (
    await inviteField.isVisible({ timeout: 2000 }).catch((err) => {
      if (String(err).includes('Timeout')) return false;
      throw err;
    })
  ) {
    await inviteField.fill(inviteCode);
  }

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/verify-email', { timeout: 15000 });
  await verifyEmail(page);
  await signOutAndIn(page, user);
}

/**
 * Sign out via API and sign back in via the login page.
 * Used after email verification to get a fresh session with emailVerified: true.
 */
async function signOutAndIn(
  page: Page,
  user: { email: string; password: string },
) {
  await apiRequest(page, 'POST', '/api/auth/sign-out');
  await page.goto('/login');
  await page.getByLabel('Email').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

export async function loginUser(
  page: Page,
  user: { email: string; password: string },
  /** Where to navigate after login. Defaults to '/dashboard'. */
  navigateTo = '/dashboard',
) {
  // Use API-based login to avoid flaky SPA rendering waits.
  // Navigate to the login page first to establish a page context within the SPA
  // (navigating from a non-SPA page like /api/health can cause React init issues).
  await page.goto('/login', { timeout: 30000 });
  const signInStatus = await page.evaluate(async (u) => {
    const r = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    return r.status;
  }, user);
  if (signInStatus !== 200) {
    throw new Error(`loginUser: sign-in API returned ${signInStatus}`);
  }
  await page.goto(navigateTo, { timeout: 45000 });
  // Wait for SPA hydration — the page shell loads before React renders routes
  await page.waitForLoadState('domcontentloaded');
}

export async function navigateToCourses(page: Page) {
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

export async function navigateToCourse(page: Page, courseTitle: string) {
  await navigateToCourses(page);
  await page.getByText(courseTitle).click();
  await expect(
    page.getByRole('heading', { name: 'Scenarios', exact: true }),
  ).toBeVisible();
}

export async function sendMessage(page: Page, text: string) {
  const textarea = page.getByPlaceholder('Respond to the student...');
  // Wait for textarea to be editable (may be disabled during AI streaming)
  await expect(textarea).toBeEditable({ timeout: 120000 });
  await textarea.fill(text);
  await textarea.press('Enter');
  // Wait for "Student is responding..." to appear (may be very fast)
  await page
    .waitForSelector('text=Student is responding...', { timeout: 5000 })
    .catch((err) => {
      // Streaming indicator didn't appear within 5s — AI response may have been instant
      if (!String(err).includes('Timeout')) throw err;
    });
  // Wait for streaming to finish — indicator must disappear
  await page.waitForSelector('text=Student is responding...', {
    state: 'hidden',
    timeout: 120000,
  });
}

export async function openObserver(page: Page) {
  await page.getByRole('button', { name: 'Observer', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Observer panel' }),
  ).toBeVisible({ timeout: 15000 });
}

export async function sendObserverMessage(page: Page, text: string) {
  const textarea = page.getByPlaceholder('Ask the observer...');
  await textarea.fill(text);
  await textarea.press('Enter');
  // Wait for observer streaming to finish
  await page
    .waitForSelector('text=Observer is responding...', { timeout: 5000 })
    .catch((err) => {
      if (!String(err).includes('Timeout')) throw err;
    });
  await page.waitForSelector('text=Observer is responding...', {
    state: 'hidden',
    timeout: 60000,
  });
}

/**
 * Wait for a conversation's message count to reach a target (polls API).
 * Uses progressive intervals: 200ms, 500ms, 1s to balance speed and load.
 */
export async function waitForMessageCount(
  page: Page,
  conversationId: string,
  targetCount: number,
  timeoutMs = 30000,
) {
  await expect
    .poll(
      async () => {
        const res = await apiRequest(
          page,
          'GET',
          `/api/conversations/${conversationId}`,
        );
        return res.data?.messageCount ?? 0;
      },
      { timeout: timeoutMs, intervals: [200, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(targetCount);
}

/**
 * Make an API call with the page's auth cookies
 */
export async function apiRequest(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: E2E test helper — API responses have dynamic shapes
): Promise<{ status: number; data: Record<string, any> }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    },
    { method, path, body },
  );
}
