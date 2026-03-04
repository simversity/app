import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  loginUser,
  navigateToCourse,
  registerUser,
  SEED,
  sendMessage,
  uniqueUser,
} from './helpers';

test.describe('Teacher Conversation Flow', () => {
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

  test('start Riley conversation shows opening message', async ({ page }) => {
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    const messages = page.locator('[data-slot="message-content"]');
    await expect(messages.first()).toBeVisible({ timeout: 30000 });
  });

  test('send messages and receive non-empty responses', async ({ page }) => {
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });

    await sendMessage(
      page,
      "That's an interesting thought. Can you tell me more about why you think that?",
    );

    const messages = page.locator('[data-slot="message-content"]');
    let count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify the AI response has substantial content (not just whitespace)
    const lastMessage = messages.last();
    const text = await lastMessage.textContent();
    expect(text?.trim().length).toBeGreaterThan(10);
    // Mock AI responses are about natural selection — verify topical relevance
    const allText = (text ?? '').toLowerCase();
    expect(
      allText.includes('natural selection') ||
        allText.includes('adapt') ||
        allText.includes('traits') ||
        allText.includes('survive') ||
        allText.includes('evolution') ||
        allText.includes('species') ||
        allText.includes('organisms'),
    ).toBe(true);

    // Send a second message to verify sequential exchanges work
    await sendMessage(page, "What makes you think that's how it works?");
    count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('end conversation transitions to post-conversation phase', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });

    await sendMessage(page, 'Tell me more about that idea.');
    await sendMessage(page, "What makes you think that's how it works?");
    await sendMessage(page, 'Can you elaborate on that?');

    await page.getByRole('button', { name: /End Conversation/ }).click();
    // Confirm the AlertDialog
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'End Conversation' }).click();
    await expect(
      page.getByRole('heading', { name: 'Observer Feedback' }).first(),
    ).toBeVisible({ timeout: 45000 });
  });

  test('start group conversation shows both opening messages', async ({
    page,
  }) => {
    await navigateToCourse(page, SEED.courseTitle);
    // Click the second scenario — Group Discussion with Riley + Sam
    await page.getByRole('link', { name: 'Start conversation' }).nth(1).click();
    const messages = page.locator('[data-slot="message-content"]');
    // Both agents post opening messages; wait for the second to appear
    await expect(messages.nth(1)).toBeVisible({ timeout: 30000 });

    const rileyText = await messages.nth(0).textContent();
    const samText = await messages.nth(1).textContent();
    // Riley's opening mentions "turned white", Sam's mentions "population shifted"
    expect(rileyText).toContain(SEED.rileyOpeningFragment);
    expect(samText).toContain(SEED.samOpeningFragment);
  });

  test('End Conversation button is disabled before minimum exchanges', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });

    const endBtn = page.getByRole('button', { name: /End Conversation/ });
    // Only 1 message (opening) — should be disabled
    await expect(endBtn).toBeDisabled();

    // Send one message → 3 messages total (opening + teacher + AI) — still disabled
    await sendMessage(page, 'Tell me more about that.');
    await expect(endBtn).toBeDisabled();

    // Send another → 5 messages total — now enabled
    await sendMessage(page, 'Why do you think so?');
    await expect(endBtn).toBeEnabled({ timeout: 10000 });
  });

  test('page refresh mid-conversation resumes conversation', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await navigateToCourse(page, SEED.courseTitle);
    await page
      .getByRole('link', { name: 'Start conversation' })
      .first()
      .click();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });

    await sendMessage(page, 'Tell me more about your reasoning.');
    const countBefore = await page
      .locator('[data-slot="message-content"]')
      .count();
    expect(countBefore).toBeGreaterThanOrEqual(3);

    // Refresh — the server returns the existing active conversation
    await page.reload();
    await expect(
      page.locator('[data-slot="message-content"]').first(),
    ).toBeVisible({ timeout: 30000 });

    // Messages should be preserved (same active conversation resumed)
    const countAfter = await page
      .locator('[data-slot="message-content"]')
      .count();
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  });
});
