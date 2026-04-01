export const ConversationStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const;

export const UserRole = {
  TEACHER: 'teacher',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export const ErrorCode = {
  CONVERSATION_NOT_ACTIVE: 'CONVERSATION_NOT_ACTIVE',
  CONVERSATION_ABANDONED: 'CONVERSATION_ABANDONED',
  MESSAGE_LIMIT_REACHED: 'MESSAGE_LIMIT_REACHED',
} as const;

// --- Inline observer nudge settings ---

/** Only send a nudge every N teacher turns. */
export const NUDGE_EVERY_N_TURNS = 3;
/** Number of recent messages to include in the nudge context. */
export const NUDGE_CONTEXT_RECENT_MESSAGES = 6;
/** Max tokens for the nudge completion response. */
export const NUDGE_MAX_TOKENS = 60;

// --- Conversation limits ---

export const MAX_MESSAGE_CHARS = 5000;
export const MAX_MESSAGES_PER_CONVERSATION = 100;
export const MIN_MESSAGES_TO_COMPLETE = 5;

// --- Streaming / cache limits ---

/** Maximum characters per AI response before truncating. */
export const MAX_RESPONSE_CHARS = 512 * 1024;
/** Abort AI stream if no chunk arrives within this window (ms). */
export const INACTIVITY_TIMEOUT_MS = 60_000;
/** TTL for cached scenario agent data (ms). */
export const AGENT_CACHE_TTL_MS = 5 * 60 * 1000;
/** Maximum number of entries in the agent cache LRU. */
export const MAX_CACHE_SIZE = 200;

/** Document types uploaded to NEAR AI Files API. */
export const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/json',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

/** Image types sent as base64 data URIs in chat messages. */
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/** User-facing error messages shared across routes. */
export const ErrorMessage = {
  STUDENT_TROUBLE:
    'The student is having trouble responding. Please try again.',
  STUDENT_EMPTY: 'The student could not generate a response. Please try again.',
  STUDENT_TIMEOUT: 'The student took too long to respond. Please try again.',
  STUDENT_RATE_LIMITED:
    'Too many requests to the AI service. Please wait a moment and try again.',
  OBSERVER_TROUBLE:
    'The observer is having trouble responding. Please try again.',
  OBSERVER_EMPTY:
    'The observer could not generate a response. Please try again.',
  OBSERVER_TIMEOUT: 'The observer took too long to respond. Please try again.',
  OBSERVER_RATE_LIMITED:
    'Too many requests to the AI service. Please wait a moment and try again.',
} as const;
