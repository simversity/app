import { ApiError } from './api';

/**
 * Map an error to a user-friendly message based on its type and status code.
 * Preserves meaningful server messages; replaces generic/technical ones.
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const hasServerMessage =
      error.message && !error.message.startsWith('Request failed:');

    if (error.status === 429) {
      if (error.retryAfter && error.retryAfter > 0) {
        return `Too many requests. Please try again in ${error.retryAfter} seconds.`;
      }
      return hasServerMessage
        ? error.message
        : 'Too many requests. Please wait a moment and try again.';
    }
    if (error.status === 413) {
      return hasServerMessage
        ? error.message
        : 'Your message is too long. Please shorten it and try again.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our end. Please try again shortly.';
    }
    return hasServerMessage
      ? error.message
      : 'Something went wrong. Please try again.';
  }

  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Unable to connect. Please check your internet connection and try again.';
  }

  if (error instanceof Error) {
    if (
      error.message.includes('timed out') ||
      error.message.includes('interrupted')
    ) {
      return error.message;
    }
    return error.message || 'Something went wrong. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Extract a user-friendly message from errors caught in form submissions.
 * Treats network failures specially since their default message is unhelpful.
 */
export function getFormErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message !== 'Failed to fetch') {
    return err.message;
  }
  return 'Unable to connect. Please check your network and try again.';
}
