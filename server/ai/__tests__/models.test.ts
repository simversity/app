import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock dependencies before importing the module under test
mock.module('../../lib/env', () => ({
  env: { NEARAI_API_KEY: 'test-key', NEARAI_MODEL: 'test-model' },
  MODEL_ALLOWLIST: [],
}));

mock.module('../../lib/logger', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

mock.module('../client', () => ({
  NEARAI_BASE_URL: 'https://test-api.example.com/v1',
}));

/**
 * costTier, formatContext, toPerMillion, and applyAllowlist are private.
 * We test them indirectly through fetchModels, but we can also test the
 * logic by re-implementing minimal checks against the exported behavior.
 * Since fetchModels is the main export, we focus on that.
 */
import { _resetModelCache, fetchModels } from '../models';

let originalFetch: typeof globalThis.fetch;

describe('fetchModels', () => {
  beforeEach(() => {
    _resetModelCache();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns fallback models when fetch fails', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error')),
    ) as unknown as typeof fetch;
    const models = await fetchModels();
    expect(models.length).toBeGreaterThan(0);
    // Verify structure of returned models
    for (const m of models) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('context');
      expect(m).toHaveProperty('tier');
      expect(['$', '$$', '$$$']).toContain(m.tier);
    }
  });

  test('fallback models include DeepSeek V3.1', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('fail')),
    ) as unknown as typeof fetch;
    const models = await fetchModels();
    const deepseek = models.find((m) => m.id.includes('DeepSeek'));
    expect(deepseek).toBeDefined();
    expect(deepseek?.tier).toBe('$');
  });

  test('returns parsed models from successful API response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              {
                modelId: 'org/test-model',
                inputCostPerToken: { amount: 1, scale: 6 },
                outputCostPerToken: { amount: 3, scale: 6 },
                metadata: {
                  modelDisplayName: 'Test Model',
                  contextLength: 128000,
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    const models = await fetchModels();
    expect(models.length).toBeGreaterThanOrEqual(1);
    const testModel = models.find((m) => m.id === 'org/test-model');
    expect(testModel).toBeDefined();
    expect(testModel?.label).toBe('Test Model');
    expect(testModel?.context).toBe('128K');
    expect(testModel?.tier).toBe('$');
  });

  test('cached result is returned on subsequent calls', async () => {
    // First call: populate the cache with a successful response
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              {
                modelId: 'org/cached-model',
                inputCostPerToken: { amount: 1, scale: 6 },
                outputCostPerToken: { amount: 3, scale: 6 },
                metadata: {
                  modelDisplayName: 'Cached Model',
                  contextLength: 128000,
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    await fetchModels();

    // Second call: should use cache, not fetch
    let fetchCalled = false;
    globalThis.fetch = mock(() => {
      fetchCalled = true;
      return Promise.reject(new Error('should not be called'));
    }) as unknown as typeof fetch;
    const models = await fetchModels();
    expect(models.length).toBeGreaterThan(0);
    expect(fetchCalled).toBe(false);
  });
});
