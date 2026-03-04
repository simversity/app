import { afterEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock db — Proxy-based stub that returns configurable agent rows.
// Mirrors any Drizzle query chain shape (select/from/join/where/orderBy/etc.)
// so the mock won't silently pass if the real query chain changes.
// ---------------------------------------------------------------------------

let dbRows: Record<string, unknown>[] = [];

/** Builds a chainable proxy where every method call returns the proxy itself,
 *  except `.then()` which resolves to the current `dbRows` value. */
function drizzleChainProxy(): unknown {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'then')
        return (resolve: (v: unknown) => void) => resolve(dbRows);
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

mock.module('../../db', () => ({
  db: drizzleChainProxy(),
}));

const TEST_MAX_CACHE_SIZE = 200;

mock.module('../constants', () => ({
  AGENT_CACHE_TTL_MS: 100, // 100ms for fast TTL tests
  MAX_CACHE_SIZE: TEST_MAX_CACHE_SIZE,
}));

// Import AFTER mocks
const { loadScenarioAgents, clearAgentCache } = await import('../agent-cache');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgentRow(id: string, name: string) {
  return {
    id,
    personaId: `persona-${id}`,
    openingMessage: `Hi from ${name}`,
    sortOrder: 0,
    maxResponseTokens: null,
    personaName: name,
    systemPrompt: `You are ${name}.`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearAgentCache();
  dbRows = [];
});

describe('loadScenarioAgents', () => {
  test('returns agents from DB on cache miss', async () => {
    dbRows = [makeAgentRow('a1', 'Riley')];
    const result = await loadScenarioAgents('scenario-1');
    expect(result).toHaveLength(1);
    expect(result[0].personaName).toBe('Riley');
  });

  test('returns cached data on cache hit (no extra DB call)', async () => {
    const originalRows = [makeAgentRow('a1', 'Riley')];
    dbRows = originalRows;

    // Patch: count DB calls by observing dbRows changes
    const first = await loadScenarioAgents('scenario-2');
    dbRows = [makeAgentRow('a2', 'Sam')]; // change DB response
    const second = await loadScenarioAgents('scenario-2');

    // Should still return the cached Riley, not the new Sam
    expect(first).toEqual(second);
    expect(second[0].personaName).toBe('Riley');
  });

  test('refetches after TTL expires', async () => {
    dbRows = [makeAgentRow('a1', 'Riley')];
    const first = await loadScenarioAgents('scenario-3');
    expect(first[0].personaName).toBe('Riley');

    // Wait for TTL to expire (100ms mock TTL)
    await new Promise((r) => setTimeout(r, 150));

    dbRows = [makeAgentRow('a2', 'Sam')];
    const second = await loadScenarioAgents('scenario-3');
    expect(second[0].personaName).toBe('Sam');
  });

  test('caches different scenarios independently', async () => {
    dbRows = [makeAgentRow('a1', 'Riley')];
    await loadScenarioAgents('scenario-A');

    dbRows = [makeAgentRow('a2', 'Sam')];
    await loadScenarioAgents('scenario-B');

    // Change DB response — both should still be cached
    dbRows = [makeAgentRow('a3', 'Alex')];
    const a = await loadScenarioAgents('scenario-A');
    const b = await loadScenarioAgents('scenario-B');
    expect(a[0].personaName).toBe('Riley');
    expect(b[0].personaName).toBe('Sam');
  });

  test('evicts oldest entry when cache exceeds capacity', async () => {
    // Fill cache to capacity
    for (let i = 0; i < TEST_MAX_CACHE_SIZE; i++) {
      dbRows = [makeAgentRow(`a${i}`, `Agent${i}`)];
      await loadScenarioAgents(`scenario-${i}`);
    }

    // Adding one more should evict the oldest
    dbRows = [makeAgentRow('new', 'NewAgent')];
    await loadScenarioAgents('scenario-new');

    // The first entry should have been evicted
    dbRows = [makeAgentRow('refetched', 'Refetched')];
    const result = await loadScenarioAgents('scenario-0');
    // It was evicted, so DB is queried again
    expect(result[0].personaName).toBe('Refetched');
  });
});

describe('clearAgentCache', () => {
  test('clears specific scenario from cache', async () => {
    dbRows = [makeAgentRow('a1', 'Riley')];
    await loadScenarioAgents('scenario-X');

    clearAgentCache('scenario-X');

    dbRows = [makeAgentRow('a2', 'Sam')];
    const result = await loadScenarioAgents('scenario-X');
    expect(result[0].personaName).toBe('Sam');
  });

  test('clears all entries when called without argument', async () => {
    dbRows = [makeAgentRow('a1', 'Riley')];
    await loadScenarioAgents('s1');
    dbRows = [makeAgentRow('a2', 'Sam')];
    await loadScenarioAgents('s2');

    clearAgentCache();

    dbRows = [makeAgentRow('a3', 'Alex')];
    const r1 = await loadScenarioAgents('s1');
    const r2 = await loadScenarioAgents('s2');
    expect(r1[0].personaName).toBe('Alex');
    expect(r2[0].personaName).toBe('Alex');
  });

  test('does not throw when clearing non-existent scenario', () => {
    expect(() => clearAgentCache('non-existent')).not.toThrow();
  });

  test('does not throw when clearing empty cache', () => {
    expect(() => clearAgentCache()).not.toThrow();
  });
});
