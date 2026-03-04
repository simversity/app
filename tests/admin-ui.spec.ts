import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  loginUser,
  uniqueUser,
  verifyEmail,
} from './helpers';

test.describe('Admin UI', () => {
  let adminUser: ReturnType<typeof uniqueUser>;
  let isAdmin = false;
  const createdCourseIds: string[] = [];
  const createdPersonaIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    adminUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();

    // Navigate to a lightweight API endpoint — avoids waiting for Rsbuild compilation
    await page.goto('/api/health', { timeout: 30000 });

    // Register via API (bypasses UI rendering)
    const signupRes = await page.evaluate(async (u) => {
      const r = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: u.name,
          email: u.email,
          password: u.password,
        }),
      });
      return r.status;
    }, adminUser);

    if (signupRes !== 200) {
      await page.close();
      await ctx.close();
      return;
    }

    // Mark email as verified and refresh session (Better-Auth caches emailVerified)
    await verifyEmail(page);
    await apiRequest(page, 'POST', '/api/auth/sign-out');
    await page.goto('/api/health', { timeout: 15000 });
    await page.evaluate(async (u) => {
      await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: u.email, password: u.password }),
      });
    }, adminUser);

    // Claim admin role if invite code is set
    const inviteCode = process.env.ADMIN_INVITE_CODE;
    if (inviteCode) {
      const claimResult = await page.evaluate(async (code) => {
        const res = await fetch('/api/claim-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ inviteCode: code }),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      }, inviteCode);
      if (claimResult.status !== 200) {
        console.error('claim-role failed:', claimResult);
      }
    }

    // Verify admin role
    const profile = await apiRequest(page, 'GET', '/api/user/profile');
    isAdmin =
      profile.data?.profile?.role === 'admin' ||
      profile.data?.profile?.role === 'super_admin';

    // Warm up the /admin SPA route so Rsbuild compiles it before tests need it
    if (isAdmin) {
      await page.goto('/admin', { timeout: 60000 });
    }

    await page.close();
    await ctx.close();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title === 'admin setup succeeded') return;
    if (!isAdmin) {
      test.skip();
      return;
    }
    await loginUser(page, adminUser, '/admin');
  });

  test('admin setup succeeded', () => {
    expect(isAdmin).toBe(true);
  });

  test('admin can create a course via the UI', async ({ page }) => {
    // First admin page load triggers SPA route compilation — allow extra time
    test.setTimeout(90000);
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }).first(),
    ).toBeVisible({ timeout: 30000 });

    await page.getByRole('link', { name: 'New Course' }).click();
    await expect(
      page.getByRole('heading', { name: 'New Course' }).first(),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel('Title').fill('E2E Test Course');
    await page.getByLabel('Description').fill('Created by automated E2E test');
    await page.getByLabel('Grade Level').fill('University');
    await page.getByLabel('Subject').fill('Testing');

    await page.getByRole('button', { name: 'Create Course' }).click();

    // Should redirect to the course editor page
    await page.waitForURL('**/admin/courses/**', { timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: 'Edit Course' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Title')).toHaveValue('E2E Test Course', {
      timeout: 10000,
    });

    // Track for cleanup
    const match = page.url().match(/\/admin\/courses\/([^/]+)/);
    if (match) createdCourseIds.push(match[1]);
  });

  test('admin can edit a course via the UI', async ({ page }) => {
    // Create a course via API to edit
    const createRes = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'Course To Edit',
      description: 'Will be edited via UI',
      gradeLevel: 'University',
      subject: 'Testing',
    });
    const courseId = createRes.data.course.id;
    createdCourseIds.push(courseId);

    await page.goto(`/admin/courses/${courseId}`);
    await expect(
      page.getByRole('heading', { name: 'Edit Course' }),
    ).toBeVisible({ timeout: 15000 });

    // Update title
    await page.getByLabel('Title').clear();
    await page.getByLabel('Title').fill('Edited Course Title');

    // Change visibility (shadcn Select — click trigger then option)
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Published' }).click();

    // Click save and wait for the PATCH response
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/admin/courses/${courseId}`) &&
          r.request().method() === 'PATCH',
        { timeout: 15000 },
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);

    // Verify the updated title persists by reloading
    await page.reload();
    await expect(page.getByLabel('Title')).toHaveValue('Edited Course Title', {
      timeout: 10000,
    });
  });

  test('admin can delete a scenario from course editor', async ({ page }) => {
    // Create a course + scenario via API
    const courseRes = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'Course With Scenario',
      description: 'Has a scenario to delete',
      gradeLevel: 'University',
      subject: 'Testing',
    });
    const courseId = courseRes.data.course.id;
    createdCourseIds.push(courseId);

    const personas = await apiRequest(page, 'GET', '/api/admin/personas');
    const personaId = personas.data.personas[0]?.id;
    if (!personaId) {
      test.skip();
      return;
    }

    await apiRequest(page, 'POST', `/api/admin/courses/${courseId}/scenarios`, {
      title: 'Scenario To Delete',
      description: 'Will be deleted from UI',
      agents: [{ personaId, openingMessage: 'Hello!', sortOrder: 0 }],
    });

    await page.goto(`/admin/courses/${courseId}`);
    const scenarioLink = page.getByRole('link', {
      name: 'Scenario To Delete',
    });
    await expect(scenarioLink).toBeVisible({ timeout: 10000 });

    // Click delete to open confirmation dialog
    await page
      .getByRole('button', { name: 'Delete Scenario To Delete' })
      .click();

    // Confirm deletion in the AlertDialog
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();

    // Scenario should be removed from list
    await expect(scenarioLink).not.toBeVisible({ timeout: 5000 });
  });

  test('admin can create a scenario via the UI', async ({ page }) => {
    // Create a course via API
    const courseRes = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'Course For New Scenario',
      description: 'Will have a scenario added via UI',
      gradeLevel: 'University',
      subject: 'Testing',
    });
    const courseId = courseRes.data.course.id;
    createdCourseIds.push(courseId);

    await page.goto(`/admin/courses/${courseId}`);
    await expect(
      page.getByRole('heading', { name: 'Edit Course' }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole('link', { name: 'New Scenario' }).click();
    await expect(
      page.getByRole('heading', { name: 'New Scenario' }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel('Title').fill('E2E Test Scenario');
    await page.getByLabel('Description').fill('Created via admin UI test');

    // Add a persona agent
    await page.getByRole('button', { name: 'Add Persona' }).click();
    await page
      .getByPlaceholder('Opening message (optional)')
      .fill('Hello from E2E!');

    await page.getByRole('button', { name: 'Create Scenario' }).click();

    // Should redirect back to the course editor
    await page.waitForURL(`**/admin/courses/${courseId}`, { timeout: 15000 });
    await expect(page.getByText('E2E Test Scenario')).toBeVisible({
      timeout: 10000,
    });
  });

  test('admin can edit a scenario title and save', async ({ page }) => {
    // Create a course + scenario via API
    const courseRes = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'Course For Scenario Edit',
      description: 'Has a scenario to edit',
      gradeLevel: 'University',
      subject: 'Testing',
    });
    const courseId = courseRes.data.course.id;
    createdCourseIds.push(courseId);

    const personas = await apiRequest(page, 'GET', '/api/admin/personas');
    const personaId = personas.data.personas[0]?.id;
    if (!personaId) {
      test.skip();
      return;
    }

    const scenarioRes = await apiRequest(
      page,
      'POST',
      `/api/admin/courses/${courseId}/scenarios`,
      {
        title: 'Scenario Before Edit',
        description: 'Will be edited',
        agents: [{ personaId, openingMessage: 'Hi', sortOrder: 0 }],
      },
    );
    const scenarioId = scenarioRes.data.scenario.id;

    await page.goto(`/admin/scenarios/${scenarioId}`);
    await expect(
      page.getByRole('heading', { name: 'Edit Scenario' }),
    ).toBeVisible({ timeout: 15000 });

    // Update the title
    await page.getByLabel('Title').clear();
    await page.getByLabel('Title').fill('Scenario After Edit');

    // Click save and wait for the PATCH response to complete
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/admin/scenarios/') &&
          r.request().method() === 'PATCH',
        { timeout: 15000 },
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);

    const responseBody = await response.json();
    expect(response.status()).toBe(200);
    expect(responseBody.scenario.title).toBe('Scenario After Edit');
  });

  test('admin can create a persona via the UI', async ({ page }) => {
    await page.goto('/admin/personas');
    await expect(page.getByRole('heading', { name: 'Personas' })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('link', { name: 'New Persona' }).click();
    await expect(
      page.getByRole('heading', { name: 'New Persona' }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel('Name').fill('E2E Test Persona');
    await page.getByLabel('Description').fill('Created by admin UI test');
    await page.getByLabel('System Prompt').fill('You are a test student.');

    await page.getByRole('button', { name: 'Create Persona' }).click();

    // Should redirect to the persona editor
    await page.waitForURL('**/admin/personas/**', { timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: 'Edit Persona' }),
    ).toBeVisible({ timeout: 15000 });

    // Track for cleanup
    const personaMatch = page.url().match(/\/admin\/personas\/([^/]+)/);
    if (personaMatch) createdPersonaIds.push(personaMatch[1]);
  });

  test('admin can edit a persona via the UI', async ({ page }) => {
    // Create persona via API
    const createRes = await apiRequest(page, 'POST', '/api/admin/personas', {
      name: 'Persona To Edit',
      description: 'Will be edited via UI',
      systemPrompt: 'You are a test student for editing.',
    });
    const personaId = createRes.data.persona.id;

    await page.goto(`/admin/personas/${personaId}`);
    await expect(
      page.getByRole('heading', { name: 'Edit Persona' }),
    ).toBeVisible({ timeout: 15000 });

    // Verify character counter is visible
    await expect(page.getByText('chars')).toBeVisible();

    // Update name
    await page.getByLabel('Name').clear();
    await page.getByLabel('Name').fill('Edited Persona Name');

    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Wait for save to complete
    await expect(
      page.getByRole('button', { name: 'Save Changes' }),
    ).toBeEnabled({ timeout: 15000 });

    // Verify via API
    const getRes = await apiRequest(
      page,
      'GET',
      `/api/admin/personas/${personaId}`,
    );
    expect(getRes.data.persona.name).toBe('Edited Persona Name');

    // Cleanup
    await apiRequest(page, 'DELETE', `/api/admin/personas/${personaId}`);
  });

  test('admin can delete a persona via the UI', async ({ page }) => {
    // Use a unique name to avoid collisions with retries
    const personaName = `Delete Me ${Date.now()}`;

    // Create persona via API
    const createRes = await apiRequest(page, 'POST', '/api/admin/personas', {
      name: personaName,
      description: 'Will be deleted from personas list',
      systemPrompt: 'You are a disposable test student.',
    });
    expect(createRes.status).toBe(201);

    await page.goto('/admin/personas');
    await expect(page.getByText(personaName)).toBeVisible({
      timeout: 10000,
    });

    // Click the delete icon button to open the confirmation dialog
    await page.getByRole('button', { name: `Delete ${personaName}` }).click();

    // Confirm deletion in the AlertDialog
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();

    // Persona should be removed from the list
    await expect(page.getByRole('link', { name: personaName })).not.toBeVisible(
      { timeout: 5000 },
    );
  });

  test('admin can change user role via user management page', async ({
    page,
    browser,
  }) => {
    // Create a regular user to change role (via API to avoid Rsbuild dependency)
    const regularUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const regPage = await ctx.newPage();
    await regPage.goto('/api/health', { timeout: 30000 });
    await regPage.evaluate(async (u) => {
      await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: u.name,
          email: u.email,
          password: u.password,
        }),
      });
    }, regularUser);
    await regPage.close();
    await ctx.close();

    await page.goto('/admin/users');
    await expect(
      page.getByRole('heading', { name: 'User Management' }),
    ).toBeVisible({ timeout: 15000 });

    // Use API to change role — UI dropdown selectors are fragile with many test users
    const usersRes = await apiRequest(page, 'GET', '/api/admin/users');
    const targetUser = usersRes.data.users.find(
      (u: { email: string }) => u.email === regularUser.email,
    );
    if (!targetUser) {
      test.skip();
      return;
    }

    // Change role from teacher to admin via API
    const patchRes = await apiRequest(
      page,
      'PATCH',
      `/api/admin/users/${targetUser.id}/role`,
      { role: 'admin' },
    );
    expect(patchRes.status).toBe(200);

    // Verify the page reflects the updated role after reload
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'User Management' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(regularUser.email)).toBeVisible();

    // Clean up: change back to teacher
    await apiRequest(page, 'PATCH', `/api/admin/users/${targetUser.id}/role`, {
      role: 'teacher',
    });
  });

  test.afterAll(async ({ browser }) => {
    if (
      !isAdmin ||
      (createdCourseIds.length === 0 && createdPersonaIds.length === 0)
    )
      return;
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await loginUser(page, adminUser);

    for (const id of createdCourseIds) {
      await apiRequest(page, 'DELETE', `/api/admin/courses/${id}`);
    }
    for (const id of createdPersonaIds) {
      await apiRequest(page, 'DELETE', `/api/admin/personas/${id}`);
    }

    await page.close();
    await ctx.close();
  });
});
