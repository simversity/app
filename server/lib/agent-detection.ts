import type { LoadedAgent } from './agent-cache';
import { escapeRegex } from './validation';

const GROUP_ADDRESS_PATTERN =
  /\b(?:you all|all of you|both of you|everyone|y'all|class|group)\b/i;

/**
 * Detect which agents are being addressed by name in the teacher's message.
 * Uses case-insensitive word-boundary matching on persona names.
 *
 * Logic order:
 * 1. Explicit name match → return matched agents
 * 2. Group-address pattern (e.g. "everyone", "you all") → return null (all)
 * 3. lastSpeakerAgentId present in agents → return [that agent]
 * 4. Fallback → return null (all agents respond)
 */
export function detectAddressedAgents(
  teacherMessage: string,
  agents: LoadedAgent[],
  lastSpeakerAgentId?: string | null,
): LoadedAgent[] | null {
  if (agents.length <= 1) return null;
  const lower = teacherMessage.toLowerCase();

  // 1. Explicit name match
  const matched = agents.filter((a) => {
    const name = a.personaName.toLowerCase();
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'u');
    return pattern.test(lower);
  });
  if (matched.length > 0) return matched;

  // 2. Group-address pattern → all agents
  if (GROUP_ADDRESS_PATTERN.test(teacherMessage)) return null;

  // 3. Last-speaker fallback → only the agent who just spoke
  if (lastSpeakerAgentId) {
    const lastSpeaker = agents.find((a) => a.personaId === lastSpeakerAgentId);
    if (lastSpeaker) return [lastSpeaker];
  }

  // 4. Fallback → all agents
  return null;
}
