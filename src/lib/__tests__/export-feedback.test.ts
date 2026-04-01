import { describe, expect, test } from 'bun:test';
import type { ChatMessage } from '@/hooks/useStreamingChat';
import { generateFeedbackMarkdown } from '../export-feedback';

function msg(
  overrides: Partial<ChatMessage> & { role: string; content: string },
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: overrides.role,
    content: overrides.content,
    isStreaming: false,
    agentName: overrides.agentName,
    toolCalls: overrides.toolCalls,
  };
}

describe('generateFeedbackMarkdown', () => {
  test('generates markdown with transcript and observer feedback', () => {
    const result = generateFeedbackMarkdown({
      scenarioTitle: 'Evolution Misconception',
      studentName: 'Riley',
      date: '2026-03-15T12:00:00Z',
      conversationMessages: [
        msg({
          role: 'assistant',
          content: 'Is evolution real?',
          agentName: 'Riley',
        }),
        msg({ role: 'user', content: 'Great question! Let me explain.' }),
        msg({
          role: 'assistant',
          content: 'But monkeys are still here!',
          agentName: 'Riley',
        }),
      ],
      observerMessages: [
        msg({
          role: 'assistant',
          content: 'The teacher used a good eliciting strategy.',
        }),
      ],
    });

    expect(result).toContain('# Observer Feedback: Evolution Misconception');
    expect(result).toContain('**Student**: Riley');
    expect(result).toContain('March 15, 2026');
    expect(result).toContain('## Conversation Transcript');
    expect(result).toContain('**Riley**: Is evolution real?');
    expect(result).toContain('**Teacher**: Great question! Let me explain.');
    expect(result).toContain('## Observer Feedback');
    expect(result).toContain('The teacher used a good eliciting strategy.');
  });

  test('filters out nudge messages', () => {
    const result = generateFeedbackMarkdown({
      scenarioTitle: 'Test',
      studentName: 'Sam',
      date: '2026-01-01',
      conversationMessages: [
        msg({ role: 'assistant', content: 'Hello!', agentName: 'Sam' }),
        msg({
          role: 'nudge',
          content: 'Consider asking about their reasoning',
        }),
        msg({ role: 'user', content: 'Tell me more.' }),
      ],
      observerMessages: [],
    });

    expect(result).not.toContain('Consider asking about their reasoning');
    expect(result).toContain('**Sam**: Hello!');
    expect(result).toContain('**Teacher**: Tell me more.');
  });

  test('uses student name as fallback when agentName is missing', () => {
    const result = generateFeedbackMarkdown({
      scenarioTitle: 'Test',
      studentName: 'Riley',
      date: '2026-01-01',
      conversationMessages: [msg({ role: 'assistant', content: 'Hello!' })],
      observerMessages: [],
    });

    expect(result).toContain('**Riley**: Hello!');
  });

  test('handles invalid date gracefully', () => {
    const result = generateFeedbackMarkdown({
      scenarioTitle: 'Test',
      studentName: 'Riley',
      date: 'not-a-date',
      conversationMessages: [],
      observerMessages: [],
    });

    // Should fall back to the raw string instead of "Invalid Date"
    expect(result).toContain('not-a-date');
    expect(result).not.toContain('Invalid Date');
  });

  test('handles empty messages arrays', () => {
    const result = generateFeedbackMarkdown({
      scenarioTitle: 'Empty Scenario',
      studentName: 'Riley',
      date: '2026-06-01',
      conversationMessages: [],
      observerMessages: [],
    });

    expect(result).toContain('# Observer Feedback: Empty Scenario');
    expect(result).toContain('## Conversation Transcript');
    expect(result).toContain('## Observer Feedback');
  });
});
