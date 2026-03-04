import type { LoadedAgent } from './agent-cache';
import { escapeRegex } from './validation';

/**
 * Detect which agents are being addressed by name in the teacher's message.
 * Uses case-insensitive word-boundary matching on persona names.
 * Returns the matched subset, or null if no names were detected (= all agents respond).
 */
export function detectAddressedAgents(
  teacherMessage: string,
  agents: LoadedAgent[],
): LoadedAgent[] | null {
  if (agents.length <= 1) return null;
  const lower = teacherMessage.toLowerCase();
  const matched = agents.filter((a) => {
    const name = a.personaName.toLowerCase();
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'u');
    return pattern.test(lower);
  });
  return matched.length > 0 ? matched : null;
}
