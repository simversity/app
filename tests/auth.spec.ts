import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  registerUser,
  registerUserWithInviteCode,
  uniqueUser,
} from './helpers';

test.describe('Authentication', () => {
  test('register with valid credentials redirects to dashboard', async ({
    page,
  }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    expect(page.url()).toContain('/dashboard');
    await expect(page.getByText(/Welcome/)).toBeVisible();
  });

  test('register with duplicate email shows error', async ({ context }) => {
    // Register user in a separate page
    const user = uniqueUser();
    const setupPage = await context.newPage();
    await registerUser(setupPage, user);
    await setupPage.close();

    // Now try registering same email in a fresh page
    const freshPage = await context.newPage();
    await freshPage.context().clearCookies();
    await freshPage.goto('/register');
    await freshPage.getByLabel('Full name').fill(user.name);
    await freshPage.getByLabel('Email').fill(user.email);
    await freshPage.getByLabel('Password').fill(user.password);
    await freshPage.getByRole('button', { name: 'Create account' }).click();

    await expect(freshPage.getByRole('alert').first()).toBeVisible({
      timeout: 10000,
    });
    expect(freshPage.url()).toContain('/register');
    await freshPage.close();
  });

  test('register with short password shows validation', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Short Pass User');
    await page.getByLabel('Email').fill('shortpass@test.com');
    await page.getByLabel('Password').fill('123');
    await page.getByRole('button', { name: 'Create account' }).click();
    // Should stay on register page and show a validation error
    await expect(page).toHaveURL(/\/register/, { timeout: 5000 });
    await expect(page.getByRole('alert').getByText(/password/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('login with invalid credentials shows error', async ({ browser }) => {
    // Register in one context
    const regContext = await browser.newContext({ baseURL: BASE_URL });
    const regPage = await regContext.newPage();
    const user = uniqueUser();
    await registerUser(regPage, user);
    await regPage.close();
    await regContext.close();

    // Try wrong password in fresh context
    const loginContext = await browser.newContext({ baseURL: BASE_URL });
    const loginPage = await loginContext.newPage();
    await loginPage.goto('/login');
    await loginPage.getByLabel('Email').fill(user.email);
    await loginPage.getByLabel('Password').fill('WrongPassword999');
    await loginPage.getByRole('button', { name: 'Sign in' }).click();

    await expect(loginPage.getByRole('alert').first()).toBeVisible({
      timeout: 10000,
    });
    expect(loginPage.url()).toContain('/login');
    await loginPage.close();
    await loginContext.close();

    // Also try non-existent email
    const freshContext = await browser.newContext({ baseURL: BASE_URL });
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/login');
    await freshPage.getByLabel('Email').fill('nonexistent@test.com');
    await freshPage.getByLabel('Password').fill('SomePassword123');
    await freshPage.getByRole('button', { name: 'Sign in' }).click();

    await expect(freshPage.getByRole('alert').first()).toBeVisible({
      timeout: 10000,
    });
    await freshPage.close();
    await freshContext.close();
  });

  test('logout invalidates session and redirects to login', async ({
    page,
  }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    expect(page.url()).toContain('/dashboard');

    // Click sign out
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');

    // Verify session is invalidated — accessing a protected route should redirect
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('session persists after page refresh', async ({ page }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    await page.reload();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('protected route redirects unauthenticated users to login', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('register with invite code promotes role', async ({ page }) => {
    const configRes = await page.goto('/api/config/registration');
    const config = await configRes?.json();

    if (!config?.inviteCodeEnabled) {
      test.skip();
      return;
    }

    const user = uniqueUser();
    await registerUserWithInviteCode(
      page,
      user,
      process.env.ADMIN_INVITE_CODE || 'test-invite',
    );

    const profile = await apiRequest(page, 'GET', '/api/user/profile');
    expect(profile.status).toBe(200);
    expect(profile.data.profile.role).toBe('admin');
  });

  test('register with invalid invite code still succeeds as teacher', async ({
    page,
  }) => {
    const configRes = await page.goto('/api/config/registration');
    const config = await configRes?.json();

    if (!config?.inviteCodeEnabled) {
      test.skip();
      return;
    }

    // Register via API to avoid rate limit exhaustion from prior UI tests
    const user = uniqueUser();
    const regRes = await page.evaluate(async (u) => {
      const r = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: u.name,
          email: u.email,
          password: u.password,
        }),
      });
      return { status: r.status };
    }, user);
    // If rate-limited, skip rather than fail
    if (regRes.status === 429) {
      test.skip();
      return;
    }
    expect(regRes.status).toBe(200);

    // Try claiming an invalid invite code — should fail with 403
    const claimRes = await page.evaluate(async () => {
      const r = await fetch('/api/claim-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteCode: 'invalid-code-12345' }),
      });
      return { status: r.status };
    });
    expect(claimRes.status).toBe(403);
  });

  test('rate limiting blocks excessive claim-role attempts', async ({
    page,
  }) => {
    // Target claim-role endpoint (limit=5/min, unaffected by TEST_MODE)
    const user = uniqueUser();
    await registerUser(page, user);

    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await page.evaluate(async (i) => {
        const r = await fetch('/api/claim-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ inviteCode: `bad-code-${i}` }),
        });
        return r.status;
      }, i);
      results.push(res);
    }

    expect(results).toContain(429);
  });
});
