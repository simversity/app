import { describe, expect, test } from 'bun:test';
import { estimateTokens, trimMessagesToFit } from '../token-estimate';

describe('estimateTokens', () => {
  test('returns positive count for non-empty text', () => {
    expect(estimateTokens('Hello world')).toBeGreaterThan(0);
  });

  test('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('longer text produces more tokens', () => {
    const short = estimateTokens('Hi');
    const long = estimateTokens(
      'Hello, this is a much longer sentence with many words',
    );
    expect(long).toBeGreaterThan(short);
  });

  test('tokenizes common English words', () => {
    // "Hello world" is typically 2 tokens in cl100k_base
    expect(estimateTokens('Hello world')).toBe(2);
  });
});

describe('trimMessagesToFit', () => {
  const system = { role: 'system', content: 'You are a student.' };
  const msg1 = { role: 'assistant', content: 'Hello teacher!' };
  const msg2 = { role: 'user', content: 'Tell me about evolution.' };
  const msg3 = { role: 'assistant', content: 'Evolution is about change.' };
  const msg4 = { role: 'user', content: 'Can you elaborate?' };

  test('returns all messages when under limit', () => {
    const messages = [system, msg1, msg2];
    const result = trimMessagesToFit(messages, 10_000);
    expect(result).toEqual(messages);
  });

  test('preserves system message and last message when trimming', () => {
    const messages = [system, msg1, msg2, msg3, msg4];
    // Very tight limit that forces trimming
    const result = trimMessagesToFit(messages, 10);
    expect(result[0]).toEqual(system);
    expect(result[result.length - 1]).toEqual(msg4);
  });

  test('keeps most recent messages when trimming', () => {
    const messages = [system, msg1, msg2, msg3, msg4];
    // Allow system + last message + some context
    const systemTokens = estimateTokens(system.content);
    const lastTokens = estimateTokens(msg4.content);
    const msg3Tokens = estimateTokens(msg3.content);
    // Budget for system + msg3 + msg4 but not msg1 and msg2
    const limit = systemTokens + lastTokens + msg3Tokens + 1;
    const result = trimMessagesToFit(messages, limit);
    expect(result[0]).toEqual(system);
    expect(result[result.length - 1]).toEqual(msg4);
    // msg3 should be kept (most recent), msg1 and msg2 trimmed
    expect(result.length).toBeLessThan(messages.length);
  });

  test('handles messages without system message', () => {
    const messages = [msg1, msg2, msg3];
    const result = trimMessagesToFit(messages, 10_000);
    expect(result).toEqual(messages);
  });

  test('handles single message', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = trimMessagesToFit(messages, 10_000);
    expect(result).toEqual(messages);
  });

  test('returns system + last message even when system exceeds limit', () => {
    const system = { role: 'system', content: 'x'.repeat(1000) };
    const last = { role: 'user', content: 'Hi' };
    const result = trimMessagesToFit([system, last], 10); // way under
    expect(result).toEqual([system, last]);
  });
});
