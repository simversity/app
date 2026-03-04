import { beforeEach, describe, expect, test } from 'bun:test';
import { testDb } from '../../__tests__/preload';
import {
  resetDb,
  seedConversation,
  seedMinimal,
  TEST_IDS,
} from '../../__tests__/test-fixtures';
import { TEACHER } from '../../__tests__/test-users';
import * as schema from '../../db/schema';
import {
  clearAgentCache,
  findScenario,
  findUserConversation,
  loadScenarioAgents,
} from '../conversation-helpers';

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDb();
  clearAgentCache();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findUserConversation', () => {
  test('returns the conversation when found', async () => {
    seedMinimal();
    seedConversation();

    const result = await findUserConversation(
      TEST_IDS.conversation1,
      TEACHER.id,
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe(TEST_IDS.conversation1);
    expect(result?.userId).toBe(TEACHER.id);
  });

  test('returns null when no conversation matches', async () => {
    seedMinimal();

    const result = await findUserConversation('nonexistent', TEACHER.id);
    expect(result).toBeNull();
  });
});

describe('findScenario', () => {
  test('returns the scenario when found', async () => {
    seedMinimal();

    const result = await findScenario(TEST_IDS.scenario1);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(TEST_IDS.scenario1);
    expect(result?.title).toBe('Evolution Misconception');
  });

  test('returns null when no scenario matches', async () => {
    const result = await findScenario('nonexistent');
    expect(result).toBeNull();
  });
});

describe('loadScenarioAgents', () => {
  test('returns agents for a scenario', async () => {
    seedMinimal();

    const result = await loadScenarioAgents(TEST_IDS.scenario1);
    expect(result.length).toBe(1);
    expect(result[0].personaName).toBe('Riley');
    expect(result[0].openingMessage).toBe(
      'Hi teacher! I heard that humans evolved from monkeys. Is that true?',
    );
  });

  test('caches results for the same scenarioId', async () => {
    seedMinimal();

    const result1 = await loadScenarioAgents(TEST_IDS.scenario1);
    const result2 = await loadScenarioAgents(TEST_IDS.scenario1);
    // Same reference means cache was used
    expect(result1).toBe(result2);
  });

  test('returns empty array when no agents exist', async () => {
    seedMinimal();
    // Add a second scenario without any agents
    testDb
      .insert(schema.scenario)
      .values({
        id: 'empty-scenario',
        courseId: TEST_IDS.course1,
        title: 'Empty Scenario',
        description: 'No agents',
        sortOrder: 1,
      })
      .run();

    const result = await loadScenarioAgents('empty-scenario');
    expect(result).toEqual([]);
  });
});

describe('clearAgentCache', () => {
  test('clearAgentCache(id) forces re-fetch from DB', async () => {
    seedMinimal();

    // Prime the cache
    const result1 = await loadScenarioAgents(TEST_IDS.scenario1);

    // Invalidate
    clearAgentCache(TEST_IDS.scenario1);

    // Next call returns fresh data (different reference)
    const result2 = await loadScenarioAgents(TEST_IDS.scenario1);
    expect(result2).not.toBe(result1);
    expect(result2).toEqual(result1);
  });

  test('clearAgentCache() without args clears all cached entries', async () => {
    seedMinimal();

    // Prime cache
    const result1 = await loadScenarioAgents(TEST_IDS.scenario1);

    // Clear all
    clearAgentCache();

    // Next call returns fresh data (different reference)
    const result2 = await loadScenarioAgents(TEST_IDS.scenario1);
    expect(result2).not.toBe(result1);
  });
});
