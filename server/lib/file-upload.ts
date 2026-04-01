import type { Context } from 'hono';
import { toFile } from 'openai';
import { db } from '../db';
import { uploadedFile } from '../db/schema';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  MAX_IMAGE_SIZE,
} from './constants';
import { clearFileCache } from './file-context';
import { log } from './logger';
import { deleteFromNearAI, uploadToNearAI } from './nearai-files';
import type { AppEnv } from './types';

/** Magic byte check: array of [offset, expected byte] pairs per image MIME type. */
type MagicSpec = { mime: string; checks: [number, number][] };

const IMAGE_MAGIC: MagicSpec[] = [
  {
    mime: 'image/png',
    checks: [
      [0, 0x89],
      [1, 0x50],
      [2, 0x4e],
      [3, 0x47],
    ],
  }, // \x89PNG
  {
    mime: 'image/jpeg',
    checks: [
      [0, 0xff],
      [1, 0xd8],
      [2, 0xff],
    ],
  }, // JFIF/EXIF
  {
    mime: 'image/gif',
    checks: [
      [0, 0x47],
      [1, 0x49],
      [2, 0x46],
    ],
  }, // GIF
  {
    mime: 'image/webp',
    // RIFF at 0-3, WEBP at 8-11 (bytes 4-7 are file size, skipped)
    checks: [
      [0, 0x52],
      [1, 0x49],
      [2, 0x46],
      [3, 0x46], // RIFF
      [8, 0x57],
      [9, 0x45],
      [10, 0x42],
      [11, 0x50], // WEBP
    ],
  },
];

/** Returns true if the file bytes match the expected magic for the declared MIME. */
export function validateImageMagic(
  mimeType: string,
  bytes: Uint8Array,
): boolean {
  const spec = IMAGE_MAGIC.find((s) => s.mime === mimeType);
  if (!spec) return true; // Not an image type we check — allow
  const maxOffset = Math.max(...spec.checks.map(([off]) => off));
  if (bytes.length <= maxOffset) return false;
  return spec.checks.every(([off, expected]) => bytes[off] === expected);
}

/**
 * Shared upload handler for both admin and conversation file routes.
 * Documents are uploaded to NEAR AI Files API; images are stored as base64 data URIs.
 */
export async function handleFileUpload(
  c: Context<AppEnv>,
  parent: { courseId?: string; scenarioId?: string },
) {
  const user = c.get('user');

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart form data' }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
  const isDocument = ALLOWED_DOCUMENT_TYPES.has(file.type);

  if (!isImage && !isDocument) {
    return c.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed: PDF, DOCX, DOC, TXT, MD, CSV, JSON, PNG, JPEG, GIF, WEBP`,
      },
      400,
    );
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > maxSize) {
    return c.json(
      { error: `File too large (max ${isImage ? '5MB' : '50MB'})` },
      413,
    );
  }

  const description =
    (formData.get('description') as string | null)?.slice(0, 2000) || null;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Validate image magic bytes to prevent MIME spoofing
  if (isImage && !validateImageMagic(file.type, bytes)) {
    return c.json({ error: 'File content does not match declared type' }, 400);
  }

  let nearaiFileId: string | null = null;
  let dataUri: string | null = null;

  if (isImage) {
    // Convert image to base64 data URI
    const base64 = Buffer.from(bytes).toString('base64');
    dataUri = `data:${file.type};base64,${base64}`;
  } else {
    // Upload document to NEAR AI
    nearaiFileId = await uploadToNearAI(
      await toFile(bytes, file.name, {
        type: file.type,
      }),
      'assistants',
    );
    if (!nearaiFileId) {
      return c.json({ error: 'Failed to upload file to AI service' }, 502);
    }
  }

  let inserted: typeof uploadedFile.$inferSelect;
  try {
    [inserted] = await db
      .insert(uploadedFile)
      .values({
        courseId: parent.courseId ?? null,
        scenarioId: parent.scenarioId ?? null,
        uploadedBy: user.id,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        description,
        nearaiFileId,
        dataUri,
      })
      .returning();
  } catch (err) {
    if (nearaiFileId) await deleteFromNearAI(nearaiFileId);
    log.error(
      { nearaiFileId, error: err instanceof Error ? err.message : err },
      'DB insert failed, cleaned up remote file',
    );
    return c.json({ error: 'Failed to save file' }, 500);
  }

  log.info(
    {
      fileId: inserted.id,
      nearaiFileId,
      isImage,
      name: file.name,
      ...parent,
      userId: user.id,
    },
    'File uploaded',
  );

  if (parent.scenarioId) clearFileCache(parent.scenarioId);
  if (parent.courseId) clearFileCache();

  // Don't return dataUri in the response (it's large)
  const { dataUri: _, ...response } = inserted;
  return c.json(response, 201);
}
