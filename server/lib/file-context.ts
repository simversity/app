import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { uploadedFile } from '../db/schema';
import { AGENT_CACHE_TTL_MS, MAX_CACHE_SIZE } from './constants';

export type FileRef = {
  nearaiFileId: string | null;
  dataUri: string | null;
  mimeType: string;
  originalName: string;
};

const fileCache = new Map<string, { data: FileRef[]; expiresAt: number }>();

/**
 * Load all file references associated with a scenario and its parent course.
 * Results are cached per scenario with the same TTL as the agent cache.
 */
export async function loadFileRefs(
  scenarioId: string,
  courseId: string,
): Promise<FileRef[]> {
  const cacheKey = scenarioId;
  const entry = fileCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) fileCache.delete(cacheKey);

  const rows = await db
    .select({
      nearaiFileId: uploadedFile.nearaiFileId,
      dataUri: uploadedFile.dataUri,
      mimeType: uploadedFile.mimeType,
      originalName: uploadedFile.originalName,
    })
    .from(uploadedFile)
    .where(
      or(
        eq(uploadedFile.scenarioId, scenarioId),
        eq(uploadedFile.courseId, courseId),
      ),
    );

  // Evict oldest if cache is full
  if (fileCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestExp = Infinity;
    for (const [key, val] of fileCache) {
      if (val.expiresAt < oldestExp) {
        oldestExp = val.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) fileCache.delete(oldestKey);
  }

  fileCache.set(cacheKey, {
    data: rows,
    expiresAt: Date.now() + AGENT_CACHE_TTL_MS,
  });
  return rows;
}

/** Invalidate cached file refs for a scenario (call after file upload/delete). */
export function clearFileCache(scenarioId?: string) {
  if (scenarioId) {
    fileCache.delete(scenarioId);
  } else {
    fileCache.clear();
  }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'file'; file_id: string }
  | { type: 'image_url'; image_url: { url: string } };

type MixedMessage = {
  role: string;
  content: string | ContentPart[];
};

/**
 * Attach file references to the last user message, making it multipart.
 * - Documents: {"type": "file", "file_id": "..."} (via NEAR AI Files API)
 * - Images: {"type": "image_url", "image_url": {"url": "data:..."}} (base64)
 *
 * The last user message is always preserved by trimMessagesToFit, so file
 * context is never dropped regardless of conversation length.
 */
export function attachFiles(
  messages: readonly { role: string; content: string }[],
  fileRefs: FileRef[],
): MixedMessage[] {
  if (fileRefs.length === 0) return messages as MixedMessage[];

  const parts: ContentPart[] = [];
  for (const ref of fileRefs) {
    if (ref.nearaiFileId) {
      parts.push({ type: 'file', file_id: ref.nearaiFileId });
    } else if (ref.dataUri) {
      parts.push({
        type: 'image_url',
        image_url: { url: ref.dataUri },
      });
    }
  }

  if (parts.length === 0) return messages as MixedMessage[];

  // Find the last user message and make it multipart
  const result: MixedMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') {
      const existing = result[i].content;
      const textPart: ContentPart = {
        type: 'text',
        text: typeof existing === 'string' ? existing : '',
      };
      result[i] = {
        role: 'user',
        content: [textPart, ...parts],
      };
      break;
    }
  }
  return result;
}
