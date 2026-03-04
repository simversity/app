import { expect, test } from '@playwright/test';
import {
  apiRequest,
  BASE_URL,
  loginUser,
  registerUser,
  uniqueUser,
} from './helpers';

test.describe('User Profile', () => {
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

  test('view profile via API returns user data', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/user/profile');
    expect(res.status).toBe(200);
    expect(res.data.profile.name).toBe(user.name);
    expect(res.data.profile.email).toBe(user.email);
    expect(res.data.profile.role).toBe('teacher');
  });

  test('update profile fields via API', async ({ page }) => {
    try {
      // Name
      const nameRes = await apiRequest(page, 'PATCH', '/api/user/profile', {
        name: 'Updated Name',
      });
      expect(nameRes.status).toBe(200);
      expect(nameRes.data.profile.name).toBe('Updated Name');

      const verify = await apiRequest(page, 'GET', '/api/user/profile');
      expect(verify.data.profile.name).toBe('Updated Name');

      // Grade level
      const gradeRes = await apiRequest(page, 'PATCH', '/api/user/profile', {
        gradeLevel: 'High School',
      });
      expect(gradeRes.status).toBe(200);
      expect(gradeRes.data.profile.gradeLevel).toBe('High School');

      // Subjects
      const subjectsRes = await apiRequest(page, 'PATCH', '/api/user/profile', {
        subjects: 'Biology, Chemistry',
      });
      expect(subjectsRes.status).toBe(200);
      expect(subjectsRes.data.profile.subjects).toBe('Biology, Chemistry');

      // Experience years
      const expRes = await apiRequest(page, 'PATCH', '/api/user/profile', {
        experienceYears: 5,
      });
      expect(expRes.status).toBe(200);
      expect(expRes.data.profile.experienceYears).toBe(5);
    } finally {
      // Restore all fields so downstream tests see clean state
      await apiRequest(page, 'PATCH', '/api/user/profile', {
        name: user.name,
        gradeLevel: '',
        subjects: '',
        experienceYears: 0,
      });
    }
  });

  test('empty update is rejected', async ({ page }) => {
    const res = await apiRequest(page, 'PATCH', '/api/user/profile', {});
    expect(res.status).toBe(400);
  });

  test('profile page shows user info and edit form', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('main').getByText(user.name)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('main').getByText(user.email)).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Grade Level')).toBeVisible();
    await expect(page.getByLabel('Subjects')).toBeVisible();
    await expect(page.getByLabel('Years of Experience')).toBeVisible();
  });

  test('cancel edit discards unsaved changes', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('main').getByText(user.name)).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Name').fill('SHOULD NOT SAVE');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Should return to view mode with original name
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancel' }),
    ).not.toBeVisible();
    await expect(page.getByText('SHOULD NOT SAVE')).not.toBeVisible();
    await expect(page.getByRole('main').getByText(user.name)).toBeVisible();
  });

  test('edit profile via UI', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Name').fill('New Name Via UI');
    await page.getByLabel('Grade Level').fill('University');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('New Name Via UI')).toBeVisible({
      timeout: 10000,
    });
  });
});
