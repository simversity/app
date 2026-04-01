import type { Uploadable } from 'openai/uploads';
import { openai } from '../ai/client';
import { log } from './logger';

/**
 * Upload a file to the NEAR AI Files API.
 * Returns the remote file ID on success, or null on failure.
 */
export async function uploadToNearAI(
  file: Uploadable,
  purpose: 'assistants' | 'fine-tune' = 'assistants',
): Promise<string | null> {
  try {
    const result = await openai.files.create({ file, purpose });
    log.info(
      { nearaiFileId: result.id, filename: result.filename },
      'File uploaded to NEAR AI',
    );
    return result.id;
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Failed to upload file to NEAR AI',
    );
    return null;
  }
}

/**
 * Delete a file from the NEAR AI Files API.
 * Best-effort — logs errors but does not throw.
 */
export async function deleteFromNearAI(nearaiFileId: string): Promise<void> {
  try {
    await openai.files.delete(nearaiFileId);
    log.info({ nearaiFileId }, 'File deleted from NEAR AI');
  } catch (err) {
    log.warn(
      { nearaiFileId, error: err instanceof Error ? err.message : err },
      'Failed to delete file from NEAR AI (may already be gone)',
    );
  }
}

/**
 * Fetch file content from the NEAR AI Files API.
 * Returns a Response-like object for streaming to the client.
 */
export async function fetchFileContent(
  nearaiFileId: string,
): Promise<Response | null> {
  try {
    const response = await openai.files.content(nearaiFileId);
    return response as unknown as Response;
  } catch (err) {
    log.error(
      { nearaiFileId, error: err instanceof Error ? err.message : err },
      'Failed to fetch file content from NEAR AI',
    );
    return null;
  }
}
