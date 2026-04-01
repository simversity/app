/** Timeout for SSE streaming requests (client-side). */
export const STREAM_TIMEOUT_MS = 60_000;

/** Application display name used in page titles and branding. */
export const APP_NAME = 'Simversity';

/** Error message for connection loss during streaming. */
export const CONNECTION_LOST_MESSAGE =
  'Connection lost. You can re-send your last message to continue.';

/** localStorage key prefix for chat message drafts. */
export const DRAFT_PREFIX = 'simversity:draft:';

/** localStorage key for tracking whether the user has used the observer. */
export const OBSERVER_USED_KEY = 'simversity:observer-used';
