import { describe, expect, test } from 'bun:test';
import { deterministicUUID } from '../scenarios';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicUUID', () => {
  test('produces valid UUID v4 format', () => {
    expect(deterministicUUID('test-seed')).toMatch(UUID_V4_REGEX);
  });

  test('same seed produces same UUID every time', () => {
    const a = deterministicUUID('my-seed');
    const b = deterministicUUID('my-seed');
    expect(a).toBe(b);
  });

  test('different seeds produce different UUIDs', () => {
    const a = deterministicUUID('seed-1');
    const b = deterministicUUID('seed-2');
    expect(a).not.toBe(b);
  });

  test('version nibble is always 4', () => {
    const uuid = deterministicUUID('version-test');
    // Version is the 13th character (index 14 with hyphens)
    expect(uuid[14]).toBe('4');
  });

  test('variant bits are correct (8, 9, a, or b)', () => {
    const uuid = deterministicUUID('variant-test');
    // Variant nibble is at position 19 (after third hyphen)
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });
});
