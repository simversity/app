/**
 * Pick only the defined (non-undefined) entries from an object.
 * Useful for building partial update objects from optional fields.
 */
export function pickDefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Build a partial update set from optional fields, always appending
 * `updatedAt` and optionally `updatedBy`.
 */
export function buildUpdateSet<T extends Record<string, unknown>>(
  fields: T,
  updatedBy?: string,
) {
  return {
    ...pickDefined(fields),
    ...(updatedBy !== undefined ? { updatedBy } : {}),
    updatedAt: new Date(),
  };
}
