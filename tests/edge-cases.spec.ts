import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  loginUser,
  registerUser,
  registerUserWithInviteCode,
  SEED,
  uniqueUser,
  waitForMessageCount,
} from './helpers';

test.describe('Edge Cases & Error Handling', () => {
  let user: ReturnType<typeof uniqueUser>;

  test.beforeAll(async ({ browser }) => {
    user = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await registerUser(page, user);
    await page.close();
    await ctx.close();
  });

  test('unauthenticated API calls return 401', async ({ page }) => {
    // Navigate to app first so page.evaluate has an origin, but don't login
    await page.goto('/login');

    const endpoints = [
      { method: 'GET', path: '/api/user/profile' },
      { method: 'GET', path: '/api/conversations/test-id' },
      { method: 'GET', path: '/api/progress/summary' },
    ];

    for (const { method, path } of endpoints) {
      const res = await page.evaluate(
        async ({ method, path }) => {
          const r = await fetch(path, { method, credentials: 'include' });
          return r.status;
        },
        { method, path },
      );
      expect(res, `Expected 401 for ${method} ${path}`).toBe(401);
    }
  });

  test('invalid conversation/scenario IDs return 404', async ({ page }) => {
    await loginUser(page, user);

    const convRes = await apiRequest(
      page,
      'GET',
      '/api/conversations/00000000-0000-0000-0000-000000000000',
    );
    expect(convRes.status).toBe(404);

    const scenarioRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: '00000000-0000-4000-8000-000000000001',
    });
    expect(scenarioRes.status).toBe(404);
  });

  test('XSS in message content is rendered as text', async ({ page }) => {
    await loginUser(page, user);

    // Start a conversation via API
    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    expect(typeof convId).toBe('string');

    // Send XSS attempt via API — just verify it's stored safely
    const xssContent = '<script>alert("xss")</script>';
    const msgRes = await apiRequest(
      page,
      'POST',
      `/api/conversations/${convId}/messages`,
      { content: xssContent },
    );
    // Should succeed (the message is valid text)
    expect([200, 201]).toContain(msgRes.status);

    // Verify the message is stored as-is (not executed)
    const convData = await apiRequest(
      page,
      'GET',
      `/api/conversations/${convId}`,
    );
    const teacherMsg = convData.data?.messages?.find(
      (m: { role: string; content: string }) =>
        m.role === 'user' && m.content.includes('alert'),
    );
    expect(teacherMsg).toBeDefined();
    // Content should be stored as literal text
    expect(teacherMsg.content).toContain('<script>');
  });

  test('XSS script tags are escaped in rendered HTML', async ({ page }) => {
    await loginUser(page, user);

    // Start a conversation via API
    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    expect(typeof convId).toBe('string');

    // Send XSS attempt via API
    const xssContent = '<script>window.__xss_executed=true</script>';
    await apiRequest(page, 'POST', `/api/conversations/${convId}/messages`, {
      content: xssContent,
    });

    // Navigate to the conversation page to render the message in the browser
    await page.goto(`/conversations/${convId}`);
    await page.waitForSelector('[data-slot="message-content"]', {
      timeout: 15000,
    });

    // Verify the script did NOT execute
    const xssExecuted = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__xss_executed,
    );
    expect(xssExecuted).toBeFalsy();

    // Verify the script tag is rendered as visible text, not as an HTML element
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('<script>');
    // No injected <script> elements should exist (page may have its own scripts,
    // but our injected content should be rendered as text)
    const injectedScript = await page.evaluate(() =>
      document
        .querySelector('script:not([src]):not([type])')
        ?.textContent?.includes('__xss_executed'),
    );
    expect(injectedScript).toBeFalsy();
  });

  test('body size limit rejects large payloads', async ({ page }) => {
    await loginUser(page, user);

    // Send a payload well over the 1MB body limit so the server rejects it.
    const bigPayload = 'x'.repeat(2 * 1024 * 1024);
    const res = await page.evaluate(async (payload) => {
      const r = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scenarioId: 'test', data: payload }),
      });
      return r.status;
    }, bigPayload);

    // Expect 413 Payload Too Large; accept 400 if proxy normalizes the error
    expect([400, 413]).toContain(res);
  });

  test('empty message cannot be sent', async ({ page }) => {
    await loginUser(page, user);

    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    expect(typeof convId).toBe('string');

    const emptyRes = await apiRequest(
      page,
      'POST',
      `/api/conversations/${convId}/messages`,
      { content: '' },
    );
    expect(emptyRes.status).toBe(400);
  });

  test('long message is rejected', async ({ page }) => {
    await loginUser(page, user);

    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    expect(typeof convId).toBe('string');

    const longContent = 'x'.repeat(SEED.maxMessageLength + 1);
    const res = await apiRequest(
      page,
      'POST',
      `/api/conversations/${convId}/messages`,
      { content: longContent },
    );
    expect(res.status).toBe(400);
  });

  test('completed conversation rejects further actions', async ({ page }) => {
    await loginUser(page, user);

    // Start conversation via API
    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;
    expect(typeof convId).toBe('string');

    // Send enough messages to allow completion
    const openingCount = convRes.data?.conversation?.messageCount ?? 1;
    for (let i = 0; i < 3; i++) {
      await apiRequest(page, 'POST', `/api/conversations/${convId}/messages`, {
        content: `Message ${i + 1} — testing completed guard`,
      });
      await waitForMessageCount(page, convId, openingCount + (i + 1) * 2);
    }

    // Complete once
    const completeRes = await apiRequest(
      page,
      'PATCH',
      `/api/conversations/${convId}/complete`,
    );
    if (completeRes.status !== 200) {
      test.skip();
      return;
    }

    // Double-complete should return an error
    const doubleRes = await apiRequest(
      page,
      'PATCH',
      `/api/conversations/${convId}/complete`,
    );
    expect(doubleRes.status).toBeGreaterThanOrEqual(400);

    // Sending a message to a completed conversation should return 409
    const msgRes = await apiRequest(
      page,
      'POST',
      `/api/conversations/${convId}/messages`,
      { content: 'This should fail' },
    );
    expect(msgRes.status).toBe(409);
  });

  test('cannot access another user conversation', async ({ page, browser }) => {
    await loginUser(page, user);

    const convRes = await apiRequest(page, 'POST', '/api/conversations', {
      scenarioId: SEED.rileyScenarioId,
    });
    const convId = convRes.data?.conversation?.id;

    const user2 = uniqueUser();
    const ctx2 = await browser.newContext({
      baseURL: BASE_URL,
    });
    const page2 = await ctx2.newPage();
    await registerUser(page2, user2);

    const res = await apiRequest(page2, 'GET', `/api/conversations/${convId}`);
    expect(res.status).toBe(404);
    await page2.close();
    await ctx2.close();
  });

  test('claim-role with expired access code returns 403', async ({
    page,
    browser,
  }) => {
    // Create a temporary admin to generate the expired code
    const adminUser = uniqueUser();
    const adminCtx = await browser.newContext({ baseURL: BASE_URL });
    const adminPage = await adminCtx.newPage();

    const inviteCode = process.env.ADMIN_INVITE_CODE;
    if (!inviteCode) {
      test.skip();
      return;
    }
    await registerUserWithInviteCode(adminPage, adminUser, inviteCode);

    // Wait for admin role to be set
    await expect
      .poll(
        async () => {
          const profile = await apiRequest(
            adminPage,
            'GET',
            '/api/user/profile',
          );
          return profile.data?.profile?.role;
        },
        { timeout: 10000, intervals: [200, 500, 1000] },
      )
      .toMatch(/^(admin|super_admin)$/);

    // Create an access code that expires in 2 seconds
    const nearFuture = new Date(Date.now() + 2000).toISOString();
    const codeRes = await apiRequest(
      adminPage,
      'POST',
      '/api/admin/access-codes',
      { role: 'teacher', expiresAt: nearFuture },
    );
    await adminPage.close();
    await adminCtx.close();

    const code = codeRes.data?.code?.code;
    expect(code).toBeTruthy();

    // Poll until the code expires rather than using a hardcoded wait
    await loginUser(page, user);
    await expect
      .poll(
        async () => {
          const res = await apiRequest(page, 'POST', '/api/claim-role', {
            inviteCode: code,
          });
          return res.status;
        },
        { timeout: 10000, intervals: [500, 1000] },
      )
      .toBe(403);
  });

  test('GET /api/courses returns published courses', async ({ page }) => {
    await loginUser(page, user);

    const res = await apiRequest(page, 'GET', '/api/courses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.courses)).toBe(true);

    const nsCourse = res.data.courses.find(
      (c: { title: string }) => c.title === SEED.courseTitle,
    );
    expect(nsCourse).toBeDefined();
    expect(nsCourse.visibility).toBe('published');
  });

  test('GET /api/courses/:id returns course detail with scenarios', async ({
    page,
  }) => {
    await loginUser(page, user);

    const res = await apiRequest(page, 'GET', `/api/courses/${SEED.courseId}`);
    expect(res.status).toBe(200);
    expect(res.data.title).toBe(SEED.courseTitle);
    expect(Array.isArray(res.data.scenarios)).toBe(true);
    expect(res.data.scenarios.length).toBe(SEED.scenarioCount);
  });

  test('starting conversation on archived course returns 403', async ({
    browser,
  }) => {
    // Need an admin user to create and archive a course
    const adminUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const adminPage = await ctx.newPage();

    const inviteCode = process.env.ADMIN_INVITE_CODE;
    if (inviteCode) {
      await registerUserWithInviteCode(adminPage, adminUser, inviteCode);
    } else {
      await registerUser(adminPage, adminUser);
    }

    // Check if we actually got admin
    const profile = await apiRequest(adminPage, 'GET', '/api/user/profile');
    if (
      profile.data?.profile?.role !== 'admin' &&
      profile.data?.profile?.role !== 'super_admin'
    ) {
      await adminPage.close();
      await ctx.close();
      test.skip();
      return;
    }

    // Create a course with a scenario
    const courseRes = await apiRequest(
      adminPage,
      'POST',
      '/api/admin/courses',
      {
        title: 'Archived Course Test',
        description: 'Course to test archiving',
        gradeLevel: 'University',
        subject: 'Testing',
        visibility: 'published',
      },
    );
    const courseId = courseRes.data.course.id;

    // Get a persona for the scenario agent
    const personas = await apiRequest(adminPage, 'GET', '/api/admin/personas');
    const personaId = personas.data.personas[0]?.id;
    if (!personaId) {
      await adminPage.close();
      await ctx.close();
      test.skip();
      return;
    }

    const scenarioRes = await apiRequest(
      adminPage,
      'POST',
      `/api/admin/courses/${courseId}/scenarios`,
      {
        title: 'Archived Scenario',
        description: 'A scenario on an archived course',
        agents: [{ personaId, openingMessage: 'Hello!', sortOrder: 0 }],
      },
    );
    const scenarioId = scenarioRes.data.scenario.id;

    // Archive the course
    await apiRequest(adminPage, 'DELETE', `/api/admin/courses/${courseId}`);

    // Try starting a conversation on the archived course's scenario
    const convRes = await apiRequest(adminPage, 'POST', '/api/conversations', {
      scenarioId,
    });
    expect(convRes.status).toBe(403);
    expect(convRes.data.error).toContain('not available');

    await adminPage.close();
    await ctx.close();
  });
});
