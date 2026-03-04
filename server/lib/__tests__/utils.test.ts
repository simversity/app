import { describe, expect, test } from 'bun:test';
import { buildUpdateSet, pickDefined } from '../utils';

describe('pickDefined', () => {
  test('returns empty object for all-undefined values', () => {
    expect(pickDefined({ a: undefined, b: undefined })).toEqual({});
  });

  test('keeps defined values', () => {
    expect(pickDefined({ a: 1, b: 'hello' })).toEqual({ a: 1, b: 'hello' });
  });

  test('filters out undefined while keeping others', () => {
    expect(pickDefined({ a: 1, b: undefined, c: 'yes' })).toEqual({
      a: 1,
      c: 'yes',
    });
  });

  test('keeps null values (only filters undefined)', () => {
    expect(pickDefined({ a: null, b: undefined })).toEqual({ a: null });
  });

  test('keeps falsy values like 0, empty string, false', () => {
    expect(pickDefined({ a: 0, b: '', c: false })).toEqual({
      a: 0,
      b: '',
      c: false,
    });
  });

  test('returns empty object for empty input', () => {
    expect(pickDefined({})).toEqual({});
  });
});

describe('buildUpdateSet', () => {
  test('includes updatedAt as Date', () => {
    const before = new Date();
    const result = buildUpdateSet({ title: 'New' });
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  test('includes defined fields and strips undefined', () => {
    const result = buildUpdateSet({ title: 'Hello', desc: undefined });
    expect(result.title).toBe('Hello');
    expect('desc' in result).toBe(false);
  });

  test('includes updatedBy when provided', () => {
    const result = buildUpdateSet({ title: 'X' }, 'user-123');
    expect(result.updatedBy).toBe('user-123');
  });

  test('omits updatedBy when not provided', () => {
    const result = buildUpdateSet({ title: 'X' });
    expect('updatedBy' in result).toBe(false);
  });
});
