import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { formatZodError, hasUpdateFields, isValidUUID } from '../validation';

describe('hasUpdateFields', () => {
  test('returns false when all values are undefined', () => {
    expect(hasUpdateFields({ a: undefined, b: undefined })).toBe(false);
  });

  test('returns true when at least one value is defined', () => {
    expect(hasUpdateFields({ a: undefined, b: 'hello' })).toBe(true);
  });

  test('returns true for null values (null is not undefined)', () => {
    expect(hasUpdateFields({ a: null })).toBe(true);
  });

  test('returns false for empty object', () => {
    expect(hasUpdateFields({})).toBe(false);
  });
});

describe('formatZodError', () => {
  test('formats a simple field error', () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: '' });
    if (result.success) throw new Error('Expected failure');
    expect(formatZodError(result.error)).toContain('name');
  });

  test('formats a missing required field error', () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({});
    if (result.success) throw new Error('Expected failure');
    const msg = formatZodError(result.error);
    expect(msg).toContain('x');
    expect(msg).toContain('expected string');
  });

  test('formats nested path errors', () => {
    const schema = z.object({
      user: z.object({ email: z.string().email() }),
    });
    const result = schema.safeParse({ user: { email: 'not-an-email' } });
    if (result.success) throw new Error('Expected failure');
    expect(formatZodError(result.error)).toContain('user.email');
  });

  test('formats error for multiple failing fields (includes all)', () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });
    const result = schema.safeParse({ name: '', email: 'bad' });
    if (result.success) throw new Error('Expected failure');
    const msg = formatZodError(result.error);
    expect(msg).toContain('name');
    expect(msg).toContain('email');
    expect(msg).toContain('; ');
  });
});

describe('hasUpdateFields edge cases', () => {
  test('returns true for zero values', () => {
    expect(hasUpdateFields({ count: 0 })).toBe(true);
  });

  test('returns true for empty string values', () => {
    expect(hasUpdateFields({ name: '' })).toBe(true);
  });

  test('returns true for false boolean', () => {
    expect(hasUpdateFields({ active: false })).toBe(true);
  });
});

describe('isValidUUID', () => {
  test('accepts a valid lowercase UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  test('accepts an uppercase UUID', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  test('rejects an invalid string', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
  });

  test('rejects an empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });
});
