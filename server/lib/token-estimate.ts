import { getEncoding } from 'js-tiktoken';
import { log } from './logger';

/**
 * Real token counting using cl100k_base encoding (closest general-purpose
 * encoding for DeepSeek and most modern LLMs). The encoding is loaded once
 * at module scope and reused for all calls.
 */
const enc = getEncoding('cl100k_base');

export function estimateTokens(text: string): number {
  return enc.encode(text).length;
}

/**
 * Estimate total tokens for a message array and trim oldest messages
 * (preserving the system message) if the total exceeds the limit.
 *
 * Caches per-message token counts on first pass to avoid re-encoding
 * during the trimming walk.
 *
 * Returns the (potentially trimmed) message array.
 */
function contentToString(
  content: string | { type: string; [key: string]: unknown }[],
): string {
  if (typeof content === 'string') return content;
  // For multipart content, only estimate text parts — file refs add minimal overhead
  return content
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text)
    .join('\n');
}

export function trimMessagesToFit<
  T extends {
    role: string;
    content: string | { type: string; [key: string]: unknown }[];
  },
>(messages: T[], maxTokens: number): T[] {
  // Count tokens once per message and cache the results
  const costs = messages.map((m) => estimateTokens(contentToString(m.content)));
  let total = 0;
  for (const c of costs) total += c;

  if (total <= maxTokens) return messages;

  // Preserve system message (first) and the latest user message (last).
  // Trim oldest non-system messages until we fit.
  const system = messages[0]?.role === 'system' ? messages[0] : null;
  const systemIdx = system ? 0 : -1;
  const lastIdx = messages.length - 1;
  const lastMessage = messages[lastIdx];

  const reserved = costs[lastIdx] + (system ? costs[systemIdx] : 0);

  let budget = maxTokens - reserved;
  const kept: T[] = [];

  // Walk from newest to oldest to keep the most recent context
  const startIdx = system ? 1 : 0;
  for (let i = lastIdx - 1; i >= startIdx; i--) {
    if (budget - costs[i] < 0) break;
    budget -= costs[i];
    kept.unshift(messages[i]);
  }

  const result: T[] = [];
  if (system) result.push(system);
  result.push(...kept);
  result.push(lastMessage);

  if (result.length < messages.length) {
    log.warn(
      {
        estimated: total,
        limit: maxTokens,
        from: messages.length,
        to: result.length,
      },
      'Context trimmed to fit token limit',
    );
  }

  return result;
}
