import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { uploadedFile } from '../db/schema';
import { findUserConversation } from '../lib/conversation-helpers';
import { RATE_LIMIT_MESSAGES } from '../lib/env';
import { handleFileUpload } from '../lib/file-upload';
import { createRateLimiter } from '../lib/rate-limit';
import { tooManyRequests } from '../lib/responses';
import type { AppEnv } from '../lib/types';
import { parseUUID } from '../lib/validation';

const checkFileUploadRate = createRateLimiter(RATE_LIMIT_MESSAGES);

export const conversationFileRoutes = new Hono<AppEnv>();

/** Upload a file to the scenario associated with this conversation. */
conversationFileRoutes.post('/', async (c) => {
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const user = c.get('user');

  if (!checkFileUploadRate(user.id)) {
    return tooManyRequests(c);
  }

  const conv = await findUserConversation(parsed.id, user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  return handleFileUpload(c, { scenarioId: conv.scenarioId });
});

/** List files attached to this conversation's scenario. */
conversationFileRoutes.get('/', async (c) => {
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const user = c.get('user');

  const conv = await findUserConversation(parsed.id, user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

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
    .where(eq(uploadedFile.scenarioId, conv.scenarioId));

  return c.json({ data: files });
});
