import { and, eq, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { conversation, course, scenario, uploadedFile } from '../../db/schema';
import { clearFileCache } from '../../lib/file-context';
import { handleFileUpload } from '../../lib/file-upload';
import { deleteFromNearAI, fetchFileContent } from '../../lib/nearai-files';
import type { AppEnv } from '../../lib/types';
import { parseBody, parseUUID } from '../../lib/validation';

// --- Course files ---

export const adminCourseFileRoutes = new Hono<AppEnv>();

adminCourseFileRoutes.post('/', async (c) => {
  const result = parseUUID(c, 'courseId', 'course');
  if ('error' in result) return result.error;
  const { id: courseId } = result;

  const [crs] = await db
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, courseId));
  if (!crs) return c.json({ error: 'Course not found' }, 404);

  return handleFileUpload(c, { courseId });
});

adminCourseFileRoutes.get('/', async (c) => {
  const result = parseUUID(c, 'courseId', 'course');
  if ('error' in result) return result.error;

  const files = await db
    .select({
      id: uploadedFile.id,
      originalName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
      sizeBytes: uploadedFile.sizeBytes,
      description: uploadedFile.description,
      nearaiFileId: uploadedFile.nearaiFileId,
      createdAt: uploadedFile.createdAt,
    })
    .from(uploadedFile)
    .where(eq(uploadedFile.courseId, result.id));
  return c.json({ data: files });
});

// --- Scenario files ---

export const adminScenarioFileRoutes = new Hono<AppEnv>();

adminScenarioFileRoutes.post('/', async (c) => {
  const result = parseUUID(c, 'scenarioId', 'scenario');
  if ('error' in result) return result.error;
  const { id: scenarioId } = result;

  const [sc] = await db
    .select({ id: scenario.id })
    .from(scenario)
    .where(eq(scenario.id, scenarioId));
  if (!sc) return c.json({ error: 'Scenario not found' }, 404);

  return handleFileUpload(c, { scenarioId });
});

adminScenarioFileRoutes.get('/', async (c) => {
  const result = parseUUID(c, 'scenarioId', 'scenario');
  if ('error' in result) return result.error;

  const files = await db
    .select({
      id: uploadedFile.id,
      originalName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
      sizeBytes: uploadedFile.sizeBytes,
      description: uploadedFile.description,
      nearaiFileId: uploadedFile.nearaiFileId,
      createdAt: uploadedFile.createdAt,
    })
    .from(uploadedFile)
    .where(eq(uploadedFile.scenarioId, result.id));
  return c.json({ data: files });
});

// --- File by ID (update description, delete, serve content) ---

export const adminFileByIdRoutes = new Hono<AppEnv>();

const updateFileSchema = z.object({
  description: z.string().max(2000).nullable(),
});

adminFileByIdRoutes.patch('/:fileId', async (c) => {
  const result = parseUUID(c, 'fileId', 'file');
  if ('error' in result) return result.error;
  const bodyResult = await parseBody(c, updateFileSchema);
  if ('error' in bodyResult) return bodyResult.error;

  const [updated] = await db
    .update(uploadedFile)
    .set({
      description: bodyResult.data.description,
      updatedAt: new Date(),
    })
    .where(eq(uploadedFile.id, result.id))
    .returning({
      id: uploadedFile.id,
      originalName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
      sizeBytes: uploadedFile.sizeBytes,
      description: uploadedFile.description,
      nearaiFileId: uploadedFile.nearaiFileId,
      courseId: uploadedFile.courseId,
      scenarioId: uploadedFile.scenarioId,
      createdAt: uploadedFile.createdAt,
      updatedAt: uploadedFile.updatedAt,
    });

  if (!updated) return c.json({ error: 'File not found' }, 404);

  // Invalidate cache
  if (updated.scenarioId) clearFileCache(updated.scenarioId);
  if (updated.courseId) clearFileCache();

  const { courseId: _c, scenarioId: _s, ...response } = updated;
  return c.json(response);
});

adminFileByIdRoutes.delete('/:fileId', async (c) => {
  const result = parseUUID(c, 'fileId', 'file');
  if ('error' in result) return result.error;

  const [file] = await db
    .select()
    .from(uploadedFile)
    .where(eq(uploadedFile.id, result.id));
  if (!file) return c.json({ error: 'File not found' }, 404);

  // Delete from DB first, then NEAR AI (best-effort) to avoid orphaned DB records
  await db.delete(uploadedFile).where(eq(uploadedFile.id, result.id));
  if (file.nearaiFileId) await deleteFromNearAI(file.nearaiFileId);

  // Invalidate cache
  if (file.scenarioId) clearFileCache(file.scenarioId);
  if (file.courseId) clearFileCache();

  return c.json({ deleted: true, id: file.id });
});

// --- File content proxy (authenticated, not admin-only) ---

export const fileContentRoutes = new Hono<AppEnv>();

fileContentRoutes.get('/:fileId/content', async (c) => {
  const result = parseUUID(c, 'fileId', 'file');
  if ('error' in result) return result.error;

  const [file] = await db
    .select({
      nearaiFileId: uploadedFile.nearaiFileId,
      originalName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
      dataUri: uploadedFile.dataUri,
      courseId: uploadedFile.courseId,
      scenarioId: uploadedFile.scenarioId,
    })
    .from(uploadedFile)
    .where(eq(uploadedFile.id, result.id));
  if (!file) return c.json({ error: 'File not found' }, 404);

  // Verify the requesting user has access to this file's parent course/scenario.
  // Admins can access any file; regular users must have a conversation in the
  // file's scenario or a scenario within the file's course.
  const currentUser = c.get('user');
  if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
    const scenarioIds = file.scenarioId
      ? [file.scenarioId]
      : file.courseId
        ? await db
            .select({ id: scenario.id })
            .from(scenario)
            .where(eq(scenario.courseId, file.courseId))
            .then((rows) => rows.map((r) => r.id))
        : [];
    if (scenarioIds.length === 0) {
      return c.json({ error: 'File not found' }, 404);
    }
    const [hasAccess] = await db
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          eq(conversation.userId, currentUser.id),
          or(...scenarioIds.map((sid) => eq(conversation.scenarioId, sid))),
        ),
      )
      .limit(1);
    if (!hasAccess) return c.json({ error: 'File not found' }, 404);
  }

  // Images: decode base64 from dataUri
  if (file.dataUri) {
    const base64 = file.dataUri.split(',')[1];
    const bytes = Buffer.from(base64, 'base64');
    return new Response(bytes, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  // Documents: proxy from NEAR AI
  if (!file.nearaiFileId) {
    return c.json({ error: 'File has no content' }, 404);
  }

  const content = await fetchFileContent(file.nearaiFileId);
  if (!content) return c.json({ error: 'Failed to fetch file content' }, 502);

  return new Response(content.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
