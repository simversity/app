import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { testDb } from '../../__tests__/preload';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedAdmin, TEST_IDS } from '../../__tests__/test-fixtures';
import {
  ADMIN,
  jsonPatch,
  registerAllTestUsers,
  TEACHER,
} from '../../__tests__/test-users';
import { course } from '../../db/schema';

describe('Admin course restore (archive → private)', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('admin can restore an archived course', async () => {
    // course2 is seeded as archived
    const [before] = testDb
      .select({ visibility: course.visibility })
      .from(course)
      .where(eq(course.id, TEST_IDS.course2))
      .all();
    expect(before.visibility).toBe('archived');

    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course2}`,
      jsonPatch({ visibility: 'private' }, ADMIN),
    );
    expect(res.status).toBe(200);

    const [after] = testDb
      .select({ visibility: course.visibility })
      .from(course)
      .where(eq(course.id, TEST_IDS.course2))
      .all();
    expect(after.visibility).toBe('private');
  });

  test('teacher cannot restore a course (403)', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course2}`,
      jsonPatch({ visibility: 'private' }, TEACHER),
    );
    expect(res.status).toBe(403);
  });

  test('restoring a non-existent course returns 404', async () => {
    const fakeId = '99999999-0000-4000-a000-000000000099';
    const res = await app.request(
      `/api/admin/courses/${fakeId}`,
      jsonPatch({ visibility: 'private' }, ADMIN),
    );
    expect(res.status).toBe(404);
  });

  test('can archive and re-restore a course', async () => {
    // Archive course1
    const res1 = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      jsonPatch({ visibility: 'archived' }, ADMIN),
    );
    expect(res1.status).toBe(200);

    const [archived] = testDb
      .select({ visibility: course.visibility })
      .from(course)
      .where(eq(course.id, TEST_IDS.course1))
      .all();
    expect(archived.visibility).toBe('archived');

    // Restore it
    const res2 = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      jsonPatch({ visibility: 'private' }, ADMIN),
    );
    expect(res2.status).toBe(200);

    const [restored] = testDb
      .select({ visibility: course.visibility })
      .from(course)
      .where(eq(course.id, TEST_IDS.course1))
      .all();
    expect(restored.visibility).toBe('private');
  });
});
