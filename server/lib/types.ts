/** Authenticated user set by auth middleware via c.set('user', ...) */
export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'teacher' | 'admin' | 'super_admin';
};

/** Row shape set by requireConversationOwner middleware. */
export type ConversationRow = {
  id: string;
  userId: string;
  scenarioId: string;
  status: string;
  messageCount: number;
  observerMessageCount: number;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

/** Hono environment type for routes behind requireAuth */
export type AppEnv = {
  Variables: {
    user: AppUser;
    session: { id: string; token: string; expiresAt: Date };
    requestId: string;
    /** Set by requireConversationOwner middleware when present. */
    conversation?: ConversationRow;
  };
};
