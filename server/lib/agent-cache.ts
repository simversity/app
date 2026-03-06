import { eq } from 'drizzle-orm';
import { db } from '../db';
import { persona, scenarioAgent } from '../db/schema';
import { AGENT_CACHE_TTL_MS, MAX_CACHE_SIZE } from './constants';

/**
 * Load scenario agents with their persona details for a given scenario.
 * Used when starting conversations and sending messages.
 * Results are cached per scenarioId with a 5-minute TTL as a safety net.
 * Persona/agent data changes infrequently via the admin UI; `clearAgentCache`
 * is called after any admin edit to invalidate stale entries immediately.
 */

type AgentData = Awaited<ReturnType<typeof loadScenarioAgentsFromDb>>;

const agentCache = new Map<string, { data: AgentData; expiresAt: number }>();

function loadScenarioAgentsFromDb(scenarioId: string) {
  return db
    .select({
      id: scenarioAgent.id,
      personaId: scenarioAgent.personaId,
      openingMessage: scenarioAgent.openingMessage,
      sortOrder: scenarioAgent.sortOrder,
      maxResponseTokens: scenarioAgent.maxResponseTokens,
      personaName: persona.name,
      personaDescription: persona.description,
      systemPrompt: persona.systemPrompt,
    })
    .from(scenarioAgent)
    .innerJoin(persona, eq(scenarioAgent.personaId, persona.id))
    .where(eq(scenarioAgent.scenarioId, scenarioId))
    .orderBy(scenarioAgent.sortOrder);
}

export async function loadScenarioAgents(scenarioId: string) {
  const entry = agentCache.get(scenarioId);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) agentCache.delete(scenarioId);
  const data = await loadScenarioAgentsFromDb(scenarioId);
  // Evict oldest entry by expiration if cache is full
  if (agentCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestExp = Infinity;
    for (const [key, val] of agentCache) {
      if (val.expiresAt < oldestExp) {
        oldestExp = val.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) agentCache.delete(oldestKey);
  }
  agentCache.set(scenarioId, {
    data,
    expiresAt: Date.now() + AGENT_CACHE_TTL_MS,
  });
  return data;
}

/** Invalidate cached agents for a scenario (call after admin edits). */
export function clearAgentCache(scenarioId?: string) {
  if (scenarioId) {
    agentCache.delete(scenarioId);
  } else {
    agentCache.clear();
  }
}

export type LoadedAgent = Awaited<
  ReturnType<typeof loadScenarioAgentsFromDb>
>[number];
