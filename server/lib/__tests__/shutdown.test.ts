import { afterEach, describe, expect, test } from 'bun:test';
import {
  canAcceptStream,
  isShuttingDown,
  MAX_USER_STREAMS,
  resetStreamTracker,
  setShuttingDown,
  trackStream,
  untrackStream,
} from '../shutdown';

afterEach(() => {
  resetStreamTracker();
});

describe('isShuttingDown', () => {
  test('returns false under normal operation', () => {
    expect(isShuttingDown()).toBe(false);
  });
});

describe('canAcceptStream', () => {
  test('returns true when no streams are active', () => {
    expect(canAcceptStream()).toBe(true);
  });

  test('returns true with a userId when under limits', () => {
    expect(canAcceptStream('user-1')).toBe(true);
  });

  test('returns false when shutting down', () => {
    setShuttingDown();
    expect(canAcceptStream()).toBe(false);
    expect(canAcceptStream('user-1')).toBe(false);
  });
});

describe('trackStream / untrackStream', () => {
  test('returns an AbortController', () => {
    const ac = trackStream();
    expect(ac).toBeInstanceOf(AbortController);
  });

  test('tracked stream can be untracked', () => {
    const ac = trackStream('user-a');
    untrackStream(ac, 'user-a');
    expect(canAcceptStream('user-a')).toBe(true);
  });
});

describe('per-user stream limits', () => {
  test('blocks a user after MAX_USER_STREAMS', () => {
    const userId = 'limit-test-user';
    for (let i = 0; i < MAX_USER_STREAMS; i++) {
      trackStream(userId);
    }
    expect(canAcceptStream(userId)).toBe(false);
  });

  test('one user at limit does not block another', () => {
    const userA = 'user-a-limit';
    const userB = 'user-b-limit';
    for (let i = 0; i < MAX_USER_STREAMS; i++) {
      trackStream(userA);
    }
    expect(canAcceptStream(userA)).toBe(false);
    expect(canAcceptStream(userB)).toBe(true);
  });

  test('untracking restores capacity for that user', () => {
    const userId = 'restore-user';
    const controllers: AbortController[] = [];
    for (let i = 0; i < MAX_USER_STREAMS; i++) {
      controllers.push(trackStream(userId));
    }
    expect(canAcceptStream(userId)).toBe(false);
    untrackStream(controllers[controllers.length - 1], userId);
    expect(canAcceptStream(userId)).toBe(true);
  });
});
