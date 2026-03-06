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
  personaDescription: 'Tends toward need-based and Lamarckian reasoning',
  systemPrompt: 'You are Riley.',
  openingMessage: 'Hi',
  sortOrder: 0,
  maxResponseTokens: null,
};

const sam = {
  id: 'sa-2',
  personaId: 'p-sam',
  personaName: 'Sam',
  personaDescription: 'Generally strong but omits inheritance step',
  systemPrompt: 'You are Sam.',
  openingMessage: 'Hey',
  sortOrder: 1,
  maxResponseTokens: null,
};

const alex = {
  id: 'sa-3',
  personaId: 'p-alex',
  personaName: 'Alex',
  personaDescription: 'Confuses genotype and phenotype',
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

  // --- New tests for last-speaker fallback and group-address ---

  test('falls back to last speaker when no name mentioned', () => {
    const result = detectAddressedAgents(
      'Can you explain more?',
      agents,
      'p-riley',
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });

  test('explicit name match takes priority over last speaker', () => {
    const result = detectAddressedAgents(
      'Sam, what do you think?',
      agents,
      'p-riley',
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-sam');
  });

  test('group-address overrides last speaker (everyone)', () => {
    const result = detectAddressedAgents(
      'What does everyone think?',
      agents,
      'p-riley',
    );
    expect(result).toBeNull();
  });

  test('group-address overrides last speaker (you all)', () => {
    const result = detectAddressedAgents(
      'You all need to reconsider',
      agents,
      'p-sam',
    );
    expect(result).toBeNull();
  });

  test('group-address: "both of you"', () => {
    const result = detectAddressedAgents(
      'Both of you have a point',
      [riley, sam],
      'p-riley',
    );
    expect(result).toBeNull();
  });

  test('group-address: "y\'all"', () => {
    const result = detectAddressedAgents(
      "Y'all are on the right track",
      agents,
      'p-alex',
    );
    expect(result).toBeNull();
  });

  test('backward compatible: omitted lastSpeakerAgentId returns null (all)', () => {
    const result = detectAddressedAgents('Tell me more about that', agents);
    expect(result).toBeNull();
  });

  test('last speaker not in agents list falls back to all', () => {
    const result = detectAddressedAgents(
      'Can you expand on that?',
      agents,
      'p-unknown',
    );
    expect(result).toBeNull();
  });

  test('null lastSpeakerAgentId falls back to all', () => {
    const result = detectAddressedAgents('Interesting, go on', agents, null);
    expect(result).toBeNull();
  });

  test('name match + group address: name match wins', () => {
    const result = detectAddressedAgents(
      'Riley, tell the group your thoughts',
      agents,
      'p-sam',
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].personaId).toBe('p-riley');
  });
});

describe('buildAgentChatMessages history attribution', () => {
  test('prefixes historical assistant messages with agent name in multi-agent', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [
        {
          role: 'assistant',
          content: 'I think evolution is about trying',
          agentId: 'p-riley',
        },
        { role: 'user', content: 'Interesting' },
      ],
      userContent: 'Tell me more',
    });

    const historyMsg = messages.find(
      (m) => m.role === 'assistant' && m.content.includes('trying'),
    );
    expect(historyMsg).toBeDefined();
    expect(historyMsg?.content).toStartWith('[Riley]:');
  });

  test('does not prefix history in single-agent conversations', () => {
    const messages = buildAgentChatMessages({
      agent: riley,
      agents: [riley],
      recentMessages: [
        { role: 'assistant', content: 'Some response', agentId: 'p-riley' },
      ],
      userContent: 'Go on',
    });

    const historyMsg = messages.find(
      (m) => m.role === 'assistant' && m.content.includes('Some response'),
    );
    expect(historyMsg?.content).toBe('Some response');
  });

  test('does not prefix history when agentId is missing', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [{ role: 'assistant', content: 'Old message' }],
      userContent: 'Continue',
    });

    const historyMsg = messages.find(
      (m) => m.role === 'assistant' && m.content.includes('Old message'),
    );
    expect(historyMsg?.content).toBe('Old message');
  });

  test('does not prefix user messages in history', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [
        { role: 'user', content: 'Teacher question', agentId: null },
      ],
      userContent: 'Next question',
    });

    const userMsg = messages.find(
      (m) => m.role === 'user' && m.content === 'Teacher question',
    );
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).not.toContain('[');
  });
});

describe('buildAgentChatMessages activity context', () => {
  test('includes activity context in system message when provided', () => {
    const messages = buildAgentChatMessages({
      agent: riley,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'Hello',
      activityContext: 'Students are working on natural selection worksheet',
    });

    const systemMsg = messages.find((m) => m.role === 'system');
    expect(systemMsg?.content).toContain('## Activity Context');
    expect(systemMsg?.content).toContain('natural selection worksheet');
  });

  test('does not include activity context section when null', () => {
    const messages = buildAgentChatMessages({
      agent: riley,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'Hello',
      activityContext: null,
    });

    const systemMsg = messages.find((m) => m.role === 'system');
    expect(systemMsg?.content).not.toContain('## Activity Context');
  });

  test('does not include activity context section when omitted', () => {
    const messages = buildAgentChatMessages({
      agent: riley,
      agents: [riley, sam],
      recentMessages: [],
      userContent: 'Hello',
    });

    const systemMsg = messages.find((m) => m.role === 'system');
    expect(systemMsg?.content).not.toContain('## Activity Context');
  });
});

describe('buildAgentChatMessages with attributed extraAssistantMessages', () => {
  test('folds extraAssistantMessages into user message with agent name prefix', () => {
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

    // Extra messages are folded into the user message (last message must be user role)
    const userMsg = messages[messages.length - 1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContain(
      '[Riley]: I think its about trying harder.',
    );
    expect(userMsg.content).toContain('Other students have already responded');
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

    const userMsg = messages[messages.length - 1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContain('Unknown agent response');
    // No [Name]: prefix for unknown agents
    expect(userMsg.content).not.toContain('[Unknown');
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
    expect(messages[1].content).toBe('Hello');
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

    // All messages should end with a user message (no trailing assistant messages)
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toContain('[Riley]: Riley says something');
    expect(lastMsg.content).toContain('[Sam]: Sam adds on');
  });

  test('message array always ends with user role', () => {
    const messages = buildAgentChatMessages({
      agent: sam,
      agents: [riley, sam],
      recentMessages: [
        { role: 'assistant', content: 'Prior message', agentId: 'p-riley' },
      ],
      userContent: 'Continue',
      extraAssistantMessages: [
        {
          role: 'assistant' as const,
          content: 'Riley just said this',
          agentId: 'p-riley',
        },
      ],
    });

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('user');
  });
});
