import { log } from './logger';

/** Structured audit log for admin operations.
 *  Writes JSON to stdout for log aggregation (Railway, CloudWatch, etc.). */
export function auditLog(
  action: string,
  userId: string,
  details?: Record<string, unknown>,
  requestId?: string,
) {
  log.info({ audit: true, action, userId, requestId, details }, 'Audit event');
}
