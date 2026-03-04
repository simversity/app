import { describe, expect, test } from 'bun:test';
import { isAbortError } from '../error-utils';

describe('isAbortError', () => {
  test('returns true for AbortError DOMException', () => {
    const err = new DOMException('The operation was aborted.', 'AbortError');
    expect(isAbortError(err)).toBe(true);
  });

  test('returns false for other DOMExceptions', () => {
    const err = new DOMException('Not allowed', 'NotAllowedError');
    expect(isAbortError(err)).toBe(false);
  });

  test('returns false for regular Error', () => {
    expect(isAbortError(new Error('abort'))).toBe(false);
  });

  test('returns false for null/undefined', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  test('returns false for non-error values', () => {
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(42)).toBe(false);
    expect(isAbortError({})).toBe(false);
  });
});
