import { describe, expect, test } from 'bun:test';
import { isAdmin } from '../utils';

describe('isAdmin', () => {
  test('returns true for "admin"', () => {
    expect(isAdmin('admin')).toBe(true);
  });

  test('returns true for "super_admin"', () => {
    expect(isAdmin('super_admin')).toBe(true);
  });

  test('returns false for "teacher"', () => {
    expect(isAdmin('teacher')).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isAdmin(null)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isAdmin('')).toBe(false);
  });

  test('returns false for arbitrary string', () => {
    expect(isAdmin('moderator')).toBe(false);
  });
});
