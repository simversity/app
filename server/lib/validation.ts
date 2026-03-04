import type { Context } from 'hono';
import type { ZodError, ZodSchema, z } from 'zod';

/** Returns true if at least one value in the parsed data is not undefined. */
export function hasUpdateFields(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => v !== undefined);
}

/** Parse JSON body and validate against a Zod schema. */
export async function parseBody<T extends ZodSchema>(
  c: Context,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: c.json({ error: formatZodError(parsed.error) }, 400) };
  }
  return { data: parsed.data };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(s: string): boolean {
  return UUID_RE.test(s);
}

/** Extract and validate a UUID route parameter. Returns { id } on success or { error } response on failure. */
export function parseUUID(
  c: Context,
  param: string,
  label?: string,
): { id: string } | { error: Response } {
  const value = c.req.param(param);
  if (!value || !isValidUUID(value)) {
    return { error: c.json({ error: `Invalid ${label ?? param} ID` }, 400) };
  }
  return { id: value };
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Validate a generic entity ID (UUID or Better-Auth format). */
export function isValidId(s: string): boolean {
  return UUID_RE.test(s) || ID_RE.test(s);
}

/** Escape special regex characters in a string for safe use in `new RegExp()`. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract user-friendly messages from a Zod validation error. */
export function formatZodError(error: ZodError): string {
  if (error.issues.length === 0) return 'Invalid request';
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}
