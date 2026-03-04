import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  loginUser,
  registerUser,
  SEED,
  uniqueUser,
  waitForMessageCount,
} from './helpers';

test.describe('Dashboard & Navigation', () => {
  let user: ReturnType<typeof uniqueUser>;

  test.beforeAll(async ({ browser }) => {
    user = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await registerUser(page, user);
    await page.close();
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, user);
  });

  test('dashboard shows empty state with link to courses', async ({ page }) => {
    await expect(page.getByText('Start your first practice')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('link', { name: 'Browse scenarios' }).first(),
    ).toBeVisible();
  });
});

test.describe('Dashboard after completing a conversation', () => {
  let completedUser: ReturnType<typeof uniqueUser>;

  test.beforeAll(async ({ browser }) => {
    completedUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await registerUser(page, completedUser);

    // Complete a full conversation lifecycle via API
    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    const openingCount = convRes.data?.conversation?.messageCount ?? 1;

    // Send 3 messages to meet the MIN_MESSAGES_TO_COMPLETE threshold (5)
    for (let i = 0; i < 3; i++) {
      await apiRequest(page, 'POST', `/api/conversations/${convId}/messages`, {
        content: `Dashboard test message ${i + 1}`,
      });
      await waitForMessageCount(page, convId, openingCount + (i + 1) * 2);
    }

    // Complete the conversation
    await apiRequest(page, 'PATCH', `/api/conversations/${convId}/complete`);

    await page.close();
    await ctx.close();
  });

  test('dashboard shows updated stats and recent conversation', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await loginUser(page, completedUser);

    // Empty state should NOT be visible
    await expect(page.getByText('No conversations yet')).not.toBeVisible({
      timeout: 10000,
    });

    // Recent conversation entry should be visible with status badge
    await expect(page.getByText('Completed').first()).toBeVisible({
      timeout: 10000,
    });

    // Verify a recent conversation entry with the scenario name is visible
    await expect(
      page.getByText('Natural Selection with Riley').first(),
    ).toBeVisible();

    // Verify the conversation count via API
    const summaryRes = await page.evaluate(async () => {
      const r = await fetch('/api/progress/summary', {
        credentials: 'include',
      });
      return r.json();
    });
    expect(summaryRes.totalConversations).toBeGreaterThanOrEqual(1);
    // Verify the recent conversation has the expected scenario
    const rileyConv = summaryRes.recentConversations?.find(
      (c: { studentName: string }) => c.studentName === 'Riley',
    );
    expect(rileyConv).toBeDefined();
    expect(rileyConv.status).toBe('completed');

    await page.close();
    await ctx.close();
  });
});
