import { describe, expect, test } from 'bun:test';
import { createDailyBudget } from '../daily-budget';

describe('createDailyBudget', () => {
  test('allows requests under the daily limit', () => {
    const budget = createDailyBudget(3);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(true);
  });

  test('blocks requests at the daily limit', () => {
    const budget = createDailyBudget(2);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(false);
  });

  test('tracks users independently', () => {
    const budget = createDailyBudget(1);
    expect(budget('user1')).toBe(true);
    expect(budget('user2')).toBe(true);
    expect(budget('user1')).toBe(false);
    expect(budget('user2')).toBe(false);
  });

  test('release decrements the counter', () => {
    const budget = createDailyBudget(2);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(false);
    budget.release('user1');
    expect(budget('user1')).toBe(true);
  });

  test('release does not go below zero', () => {
    const budget = createDailyBudget(2);
    budget.release('user1'); // no entry yet — should not throw
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(true);
    expect(budget('user1')).toBe(false);
  });

  test('resets budget when UTC date changes', () => {
    const budget = createDailyBudget(1);
    const RealDate = globalThis.Date;

    try {
      // Day 1: exhaust budget
      globalThis.Date = class extends RealDate {
        constructor() {
          super('2026-03-01T23:59:00Z');
        }
        override toISOString() {
          return '2026-03-01T23:59:00.000Z';
        }
        static override now() {
          return new RealDate('2026-03-01T23:59:00Z').getTime();
        }
      } as typeof Date;

      expect(budget('rollover-user')).toBe(true);
      expect(budget('rollover-user')).toBe(false);

      // Day 2: budget should reset
      globalThis.Date = class extends RealDate {
        constructor() {
          super('2026-03-02T00:01:00Z');
        }
        override toISOString() {
          return '2026-03-02T00:01:00.000Z';
        }
        static override now() {
          return new RealDate('2026-03-02T00:01:00Z').getTime();
        }
      } as typeof Date;

      expect(budget('rollover-user')).toBe(true);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});
