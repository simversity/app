import { afterEach, describe, expect, test } from 'bun:test';
import { MODEL_ALLOWLIST } from '../env';
import { isModelAllowed } from '../model-check';

describe('isModelAllowed', () => {
  const original = [...MODEL_ALLOWLIST];

  afterEach(() => {
    MODEL_ALLOWLIST.length = 0;
    MODEL_ALLOWLIST.push(...original);
  });

  test('returns true when allowlist is empty (allow all)', () => {
    MODEL_ALLOWLIST.length = 0;
    expect(isModelAllowed('any-model')).toBe(true);
  });

  test('returns true when model is in allowlist', () => {
    MODEL_ALLOWLIST.length = 0;
    MODEL_ALLOWLIST.push('gpt-4', 'deepseek-v3');
    expect(isModelAllowed('deepseek-v3')).toBe(true);
  });

  test('returns false when model is not in allowlist', () => {
    MODEL_ALLOWLIST.length = 0;
    MODEL_ALLOWLIST.push('gpt-4', 'deepseek-v3');
    expect(isModelAllowed('claude-3')).toBe(false);
  });
});
