import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  loginUser,
  registerUser,
  registerUserWithInviteCode,
  SEED,
  uniqueUser,
} from './helpers';

test.describe('Admin CRUD', () => {
  let adminUser: ReturnType<typeof uniqueUser>;
  let isAdmin = false;
  const createdCourseIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    adminUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();

    // Register with invite code to get admin role
    const inviteCode = process.env.ADMIN_INVITE_CODE;
    if (inviteCode) {
      await registerUserWithInviteCode(page, adminUser, inviteCode);
    } else {
      await registerUser(page, adminUser);
    }

    // Check if we actually got admin
    const profile = await apiRequest(page, 'GET', '/api/user/profile');
    isAdmin =
      profile.data?.profile?.role === 'admin' ||
      profile.data?.profile?.role === 'super_admin';

    await page.close();
    await ctx.close();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title === 'admin setup succeeded') return;
    if (!isAdmin) {
      test.skip();
      return;
    }
    await loginUser(page, adminUser);
  });

  test('admin setup succeeded', () => {
    expect(isAdmin).toBe(true);
  });

  test('non-admin cannot access admin endpoints', async ({ browser }) => {
    // This test uses a separate non-admin user
    const regularUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await registerUser(page, regularUser);

    const res = await apiRequest(page, 'GET', '/api/admin/users');
    expect(res.status).toBe(403);
    await page.close();
    await ctx.close();
  });

  test('admin can list users', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/admin/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.users)).toBe(true);
  });

  test('admin can list courses', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/admin/courses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.courses)).toBe(true);
    expect(res.data.courses.length).toBeGreaterThanOrEqual(1);
  });

  test('admin create course requires all fields', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'Missing Fields',
    });
    expect(res.status).toBe(400);
  });

  test('admin can archive a course', async ({ page }) => {
    const createRes = await apiRequest(page, 'POST', '/api/admin/courses', {
      title: 'To Archive',
      description: 'Will be archived',
      gradeLevel: 'High School',
      subject: 'Archiving',
    });
    const courseId = createRes.data.course.id;

    const delRes = await apiRequest(
      page,
      'DELETE',
      `/api/admin/courses/${courseId}`,
    );
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);
  });

  test('admin can list personas', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/admin/personas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.personas)).toBe(true);
    expect(res.data.personas.length).toBeGreaterThanOrEqual(2);
  });

  test('admin cannot delete persona in use', async ({ page }) => {
    const personas = await apiRequest(page, 'GET', '/api/admin/personas');
    const riley = personas.data.personas.find((p: { name: string }) =>
      p.name.toLowerCase().includes(SEED.rileyPersonaName),
    );
    if (!riley) {
      test.skip();
      return;
    }

    const delRes = await apiRequest(
      page,
      'DELETE',
      `/api/admin/personas/${riley.id}`,
    );
    expect(delRes.status).toBe(400);
    expect(delRes.data.error).toContain('scenario');
  });

  test('admin can manage access codes', async ({ page }) => {
    const createRes = await apiRequest(
      page,
      'POST',
      '/api/admin/access-codes',
      { role: 'teacher' },
    );
    expect(createRes.status).toBe(201);
    expect(typeof createRes.data.code.code).toBe('string');
    const codeId = createRes.data.code.id;

    const listRes = await apiRequest(page, 'GET', '/api/admin/access-codes');
    expect(listRes.status).toBe(200);
    expect(listRes.data.codes.length).toBeGreaterThanOrEqual(1);

    const delRes = await apiRequest(
      page,
      'DELETE',
      `/api/admin/access-codes/${codeId}`,
    );
    expect(delRes.status).toBe(200);
  });

  test('admin can create scenario with agents and get detail by ID', async ({
    page,
  }) => {
    const courses = await apiRequest(page, 'GET', '/api/admin/courses');
    const courseId = courses.data.courses[0]?.id;
    if (!courseId) {
      test.skip();
      return;
    }

    const personas = await apiRequest(page, 'GET', '/api/admin/personas');
    const personaId = personas.data.personas[0]?.id;
    if (!personaId) {
      test.skip();
      return;
    }

    const createRes = await apiRequest(
      page,
      'POST',
      `/api/admin/courses/${courseId}/scenarios`,
      {
        title: 'Test Scenario',
        description: 'A test scenario',
        agents: [
          {
            personaId,
            openingMessage: 'Hello teacher!',
            sortOrder: 0,
          },
        ],
      },
    );
    expect(createRes.status).toBe(201);
    const scenarioId = createRes.data.scenario.id;

    const scenariosRes = await apiRequest(
      page,
      'GET',
      `/api/admin/courses/${courseId}/scenarios`,
    );
    const created = scenariosRes.data.scenarios.find(
      (s: { id: string }) => s.id === scenarioId,
    );
    expect(created).toBeDefined();
    expect(created.agents.length).toBe(1);

    // Verify GET by ID returns full detail
    const getRes = await apiRequest(
      page,
      'GET',
      `/api/admin/scenarios/${scenarioId}`,
    );
    expect(getRes.status).toBe(200);
    expect(getRes.data.scenario.title).toBe('Test Scenario');
    expect(getRes.data.scenario.agents.length).toBe(1);

    await apiRequest(page, 'DELETE', `/api/admin/scenarios/${scenarioId}`);
  });

  test('cannot change own role', async ({ page }) => {
    const profile = await apiRequest(page, 'GET', '/api/user/profile');
    const res = await apiRequest(
      page,
      'PATCH',
      `/api/admin/users/${profile.data.profile.id}/role`,
      { role: 'teacher' },
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('own role');
  });

  test('admin sidebar visibility and teacher access denied', async ({
    page,
    browser,
  }) => {
    // Admin user sees Admin link in sidebar
    await page.goto('/dashboard');
    const adminLink = page.locator('aside').getByText('Admin');
    await expect(adminLink).toBeVisible({ timeout: 10000 });
    await adminLink.click();
    await page.waitForURL('**/admin', { timeout: 10000 });
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }).first(),
    ).toBeVisible();

    // Non-admin user sees access denied
    const regularUser = uniqueUser();
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const regPage = await ctx.newPage();
    await registerUser(regPage, regularUser);

    await regPage.goto('/admin');
    await expect(
      regPage.getByText('You do not have admin access.'),
    ).toBeVisible({ timeout: 10000 });

    // Sidebar should not show Admin link for non-admin
    const regAdminLink = regPage.locator('aside').getByText('Admin');
    await expect(regAdminLink).not.toBeVisible();

    await regPage.close();
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!isAdmin || createdCourseIds.length === 0) return;
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    await loginUser(page, adminUser);

    for (const id of createdCourseIds) {
      await apiRequest(page, 'DELETE', `/api/admin/courses/${id}`);
    }

    await page.close();
    await ctx.close();
  });
});
