import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  loginUser,
  navigateToCourse,
  openObserver,
  registerUser,
  SEED,
  sendMessage,
  sendObserverMessage,
  uniqueUser,
} from './helpers';

test.describe('Observer Feature', () => {
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
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('observer panel toggles visibility', async ({ page }) => {
    const panel = page.getByRole('complementary', { name: 'Observer panel' });
    await expect(panel).not.toBeVisible();

    await openObserver(page);
    await expect(panel).toBeVisible();

    await page.getByRole('button', { name: 'Observer', exact: true }).click();
    await expect(panel).not.toBeVisible();
  });

  test('send mid-conversation observer messages and get responses', async ({
    page,
  }) => {
    await sendMessage(page, 'Can you explain what you mean by that?');

    await openObserver(page);
    await sendObserverMessage(page, 'How am I doing so far with this student?');

    // Scope to the observer panel so we don't count conversation messages
    const observerPanel = page.getByRole('complementary', {
      name: 'Observer panel',
    });
    const observerMessages = observerPanel.locator(
      '[data-slot="message-content"]',
    );
    await expect(observerMessages).not.toHaveCount(0, { timeout: 10000 });
    const count = await observerMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Send a second observer message to verify multiple exchanges
    await sendObserverMessage(page, 'What should I try differently?');
    // Wait for the new messages to render in the DOM
    await expect
      .poll(() => observerMessages.count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(4);
  });

  test('observer shows sent message and persists after exchange', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await sendMessage(page, 'Can you explain your thinking?');

    await openObserver(page);
    await sendObserverMessage(
      page,
      'What patterns do you notice in my questioning?',
    );

    // Verify the sent message is visible in the observer panel
    await expect(
      page.getByText('What patterns do you notice').first(),
    ).toBeVisible({ timeout: 5000 });

    // Verify a response was received (at least 2 observer messages: user + assistant)
    const observerPanel = page.getByRole('complementary', {
      name: 'Observer panel',
    });
    const messages = observerPanel.locator('[data-slot="message-content"]');
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Verify the assistant response has meaningful content (not empty)
    const assistantMessage = messages.last();
    const text = await assistantMessage.textContent();
    expect(text?.trim().length).toBeGreaterThan(10);
  });

  test('observer does not interfere with student conversation', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await sendMessage(page, 'Tell me about natural selection.');

    const msgCountBefore = await page
      .locator('[data-slot="message-content"]')
      .count();

    await openObserver(page);
    await sendObserverMessage(page, 'Quick check — how am I doing?');

    await page.getByRole('button', { name: 'Observer', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Observer panel' }),
    ).not.toBeVisible();

    await sendMessage(page, 'Can you elaborate on that?');

    const allMessages = page.locator('[data-slot="message-content"]');
    const finalCount = await allMessages.count();
    expect(finalCount).toBeGreaterThan(msgCountBefore);
  });
});
