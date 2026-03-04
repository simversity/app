import { describe, expect, test } from 'bun:test';
import { formatStatus, getStatusVariant } from '../status-utils';

describe('getStatusVariant', () => {
  test('completed → success', () => {
    expect(getStatusVariant('completed')).toBe('success');
  });

  test('abandoned → destructive', () => {
    expect(getStatusVariant('abandoned')).toBe('destructive');
  });

  test('active → secondary', () => {
    expect(getStatusVariant('active')).toBe('secondary');
  });

  test('unknown status → secondary', () => {
    expect(getStatusVariant('unknown')).toBe('secondary');
  });

  test('empty string → secondary', () => {
    expect(getStatusVariant('')).toBe('secondary');
  });
});

describe('formatStatus', () => {
  test('capitalizes first letter', () => {
    expect(formatStatus('active')).toBe('Active');
  });

  test('handles already capitalized', () => {
    expect(formatStatus('Active')).toBe('Active');
  });

  test('single character', () => {
    expect(formatStatus('a')).toBe('A');
  });

  test('empty string returns empty', () => {
    expect(formatStatus('')).toBe('');
  });

  test('completed', () => {
    expect(formatStatus('completed')).toBe('Completed');
  });

  test('abandoned', () => {
    expect(formatStatus('abandoned')).toBe('Abandoned');
  });

  test('preserves rest of string', () => {
    expect(formatStatus('in_progress')).toBe('In_progress');
  });
});
