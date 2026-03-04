import { describe, expect, test } from 'bun:test';

// detectAddressedAgents is a pure function in agent-detection.ts (no DB deps).
// buildAgentChatMessages is a pure function in conversation-helpers.ts
// (DB deps are handled by the preload mock — no need to re-mock here).
import { detectAddressedAgents } from '../agent-detection';
import { buildAgentChatMessages } from '../conversation-helpers';

const riley = {
  id: 'sa-1',
  personaId: 'p-riley',
  personaName: 'Riley',
  systemPrompt: 'You are Riley.',
  openingMessage: 'Hi',
  sortOrder: 0,
  maxResponseTokens: null,
};

const sam = {
  id: 'sa-2',
  personaId: 'p-sam',
  personaName: 'Sam',
  systemPrompt: 'You are Sam.',
  openingMessage: 'Hey',
  sortOrder: 1,
  maxResponseTokens: null,
};

const alex = {
  id: 'sa-3',
  personaId: 'p-alex',
  personaName: 'Alex',
  systemPrompt: 'You are Alex.',
  openingMessage: 'Hello',
  sortOrder: 2,
  maxResponseTokens: null,
};

const agents = [riley, sam, alex];

describe('detectAddressedAgents', () => {
  test('returns null for single agent (no filtering needed)', () => {
    const result = detectAddressedAgents('Riley, what do you think?', [riley]);
    expect(result).toBeNull();
  });

  test('returns null when no names are mentioned', () => {
    const result = detectAddressedAgents(
      'What do you all think about this?',
      agents,
    );
    expect(result).toBeNull();
  });

  test('returns single agent when one name is mentioned', () => {
    const result = detectAddressedAgents(
      'Riley, can you explain that?',
      agents,
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });

  test('matches case-insensitively', () => {
    const result = detectAddressedAgents('RILEY, what do you mean?', agents);
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });

  test('matches mixed case', () => {
    const result = detectAddressedAgents('What does riley think?', agents);
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });

  test('returns multiple agents when multiple names mentioned', () => {
    const result = detectAddressedAgents(
      'Riley and Sam, do you agree?',
      agents,
    );
    expect(result).toHaveLength(2);
    const ids = result?.map((a) => a.personaId);
    expect(ids).toContain('p-riley');
    expect(ids).toContain('p-sam');
  });

  test('uses word boundary matching (no partial matches)', () => {
    // "Samantha" should not match "Sam"
    const result = detectAddressedAgents(
      'Samantha said something interesting',
      agents,
    );
    expect(result).toBeNull();
  });

  test('matches name at start of message', () => {
    const result = detectAddressedAgents('Sam, go ahead.', agents);
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-sam');
  });

  test('matches name at end of message', () => {
    const result = detectAddressedAgents('What do you think, Alex', agents);
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-alex');
  });

  test('matches name with punctuation around it', () => {
    const result = detectAddressedAgents('Riley! Can you clarify?', agents);
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });

  test('returns null for empty message', () => {
    const result = detectAddressedAgents('', agents);
    expect(result).toBeNull();
  });
});

describe('buildAgentChatMessages with attributed extraAssistantMessages', () => {
  test('prefixes extraAssistantMessages with agent name', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'What do you think?',
      extraAssistantMessages: [
        {
          role: 'assistant' as const,
          content: 'I think its about trying harder.',
          agentId: 'p-riley',
        },
      ],
    });

    // Find the extra assistant message (last before the user message is already included)
    const extraMsg = messages.find(
      (m) => m.role === 'assistant' && m.content.includes('trying harder'),
    );
    expect(extraMsg).toBeDefined();
    expect(extraMsg?.content).toStartWith('[Riley]:');
  });

  test('does not prefix when agentId not found in agents list', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'What do you think?',
      extraAssistantMessages: [
        {
          role: 'assistant' as const,
          content: 'Unknown agent response',
          agentId: 'p-unknown',
        },
      ],
    });

    const extraMsg = messages.find(
      (m) => m.role === 'assistant' && m.content.includes('Unknown agent'),
    );
    expect(extraMsg).toBeDefined();
    expect(extraMsg?.content).not.toContain('[');
  });

  test('handles empty extraAssistantMessages', () => {
    const messages = buildAgentChatMessages({
      agent: riley,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'Hello',
      extraAssistantMessages: [],
    });

    // Should be: system + user message
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  test('handles multiple extraAssistantMessages with attribution', () => {
    const messages = buildAgentChatMessages({
      agent: alex,
      agents: [riley, sam, alex],
      recentMessages: [],
      userContent: 'Go on',
      extraAssistantMessages: [
        {
          role: 'assistant' as const,
          content: 'Riley says something',
          agentId: 'p-riley',
        },
        {
          role: 'assistant' as const,
          content: 'Sam adds on',
          agentId: 'p-sam',
        },
      ],
    });

    const extras = messages.filter((m) => m.role === 'assistant');
    expect(extras).toHaveLength(2);
    expect(extras[0].content).toStartWith('[Riley]:');
    expect(extras[1].content).toStartWith('[Sam]:');
  });
});
