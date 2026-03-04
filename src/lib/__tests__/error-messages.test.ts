import { describe, expect, test } from 'bun:test';
import { ApiError } from '../api';
import { getUserFriendlyMessage } from '../error-messages';

describe('getUserFriendlyMessage', () => {
  test('429 without server message returns rate limit text', () => {
    const err = new ApiError('Request failed: 429', 429);
    expect(getUserFriendlyMessage(err)).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });

  test('429 with server message preserves it', () => {
    const err = new ApiError('Slow down, 10 requests per minute', 429);
    expect(getUserFriendlyMessage(err)).toBe(
      'Slow down, 10 requests per minute',
    );
  });

  test('413 without server message returns payload text', () => {
    const err = new ApiError('Request failed: 413', 413);
    expect(getUserFriendlyMessage(err)).toBe(
      'Your message is too long. Please shorten it and try again.',
    );
  });

  test('500 returns server error text', () => {
    const err = new ApiError('Internal Server Error', 500);
    expect(getUserFriendlyMessage(err)).toBe(
      'Something went wrong on our end. Please try again shortly.',
    );
  });

  test('502 returns server error text', () => {
    const err = new ApiError('Bad Gateway', 502);
    expect(getUserFriendlyMessage(err)).toBe(
      'Something went wrong on our end. Please try again shortly.',
    );
  });

  test('503 returns server error text', () => {
    const err = new ApiError('Service Unavailable', 503);
    expect(getUserFriendlyMessage(err)).toBe(
      'Something went wrong on our end. Please try again shortly.',
    );
  });

  test('400 with server message preserves it', () => {
    const err = new ApiError('content is required', 400);
    expect(getUserFriendlyMessage(err)).toBe('content is required');
  });

  test('400 without server message returns generic text', () => {
    const err = new ApiError('Request failed: 400', 400);
    expect(getUserFriendlyMessage(err)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  test('422 with server message preserves it', () => {
    const err = new ApiError('name: must be at least 1 character', 422);
    expect(getUserFriendlyMessage(err)).toBe(
      'name: must be at least 1 character',
    );
  });

  test('network error (Failed to fetch) returns connection text', () => {
    const err = new TypeError('Failed to fetch');
    expect(getUserFriendlyMessage(err)).toBe(
      'Unable to connect. Please check your internet connection and try again.',
    );
  });

  test('timeout error is passed through', () => {
    const err = new Error('Response timed out. Please try again.');
    expect(getUserFriendlyMessage(err)).toBe(
      'Response timed out. Please try again.',
    );
  });

  test('interrupted error is passed through', () => {
    const err = new Error('Response was interrupted. Please try again.');
    expect(getUserFriendlyMessage(err)).toBe(
      'Response was interrupted. Please try again.',
    );
  });

  test('generic Error with message preserves it', () => {
    const err = new Error('Stream failed');
    expect(getUserFriendlyMessage(err)).toBe('Stream failed');
  });

  test('Error with empty message returns fallback', () => {
    const err = new Error('');
    expect(getUserFriendlyMessage(err)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  test('non-Error value returns fallback', () => {
    expect(getUserFriendlyMessage(null)).toBe(
      'Something went wrong. Please try again.',
    );
    expect(getUserFriendlyMessage(undefined)).toBe(
      'Something went wrong. Please try again.',
    );
    expect(getUserFriendlyMessage('string error')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
