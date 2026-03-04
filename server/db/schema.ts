import { relations, sql } from 'drizzle-orm';
import * as t from 'drizzle-orm/sqlite-core';

export const user = t.sqliteTable(
  'user',
  {
    id: t.text('id').primaryKey(),
    name: t.text('name').notNull(),
    email: t.text('email').notNull().unique(),
    emailVerified: t
      .integer('emailVerified', { mode: 'boolean' })
      .notNull()
      .default(false),
    image: t.text('image'),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    // Application-specific fields
    gradeLevel: t.text('gradeLevel'),
    subjects: t.text('subjects'), // JSON array of subject strings
    experienceYears: t.integer('experienceYears'),
    role: t.text('role').notNull().default('teacher'), // 'teacher' | 'admin' | 'super_admin'
  },
  (table) => [
    t.check(
      'check_user_role',
      sql`${table.role} IN ('teacher', 'admin', 'super_admin')`,
    ),
  ],
);

export const session = t.sqliteTable(
  'session',
  {
    id: t.text('id').primaryKey(),
    expiresAt: t.integer('expiresAt', { mode: 'timestamp' }).notNull(),
    token: t.text('token').notNull().unique(),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    ipAddress: t.text('ipAddress'),
    userAgent: t.text('userAgent'),
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [t.index('idx_session_userId').on(table.userId)],
);

export const account = t.sqliteTable(
  'account',
  {
    id: t.text('id').primaryKey(),
    accountId: t.text('accountId').notNull(),
    providerId: t.text('providerId').notNull(),
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: t.text('accessToken'),
    refreshToken: t.text('refreshToken'),
    idToken: t.text('idToken'),
    accessTokenExpiresAt: t.integer('accessTokenExpiresAt', {
      mode: 'timestamp',
    }),
    refreshTokenExpiresAt: t.integer('refreshTokenExpiresAt', {
      mode: 'timestamp',
    }),
    scope: t.text('scope'),
    password: t.text('password'),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [t.index('idx_account_userId').on(table.userId)],
);

export const verification = t.sqliteTable(
  'verification',
  {
    id: t.text('id').primaryKey(),
    identifier: t.text('identifier').notNull(),
    value: t.text('value').notNull(),
    expiresAt: t.integer('expiresAt', { mode: 'timestamp' }).notNull(),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [t.index('idx_verification_identifier').on(table.identifier)],
);

export const accessCode = t.sqliteTable(
  'accessCode',
  {
    id: t
      .text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: t.text('code').notNull().unique(),
    role: t.text('role').notNull().default('teacher'), // role granted when code is redeemed
    createdBy: t
      .text('createdBy')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    usedBy: t
      .text('usedBy')
      .references(() => user.id, { onDelete: 'set null' }),
    usedAt: t.integer('usedAt', { mode: 'timestamp' }),
    expiresAt: t.integer('expiresAt', { mode: 'timestamp' }),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.check(
      'check_accessCode_role',
      sql`${table.role} IN ('teacher', 'admin')`,
    ),
    t.index('idx_accessCode_usedBy').on(table.usedBy),
  ],
);

export const course = t.sqliteTable(
  'course',
  {
    id: t.text('id').primaryKey(),
    title: t.text('title').notNull(),
    description: t.text('description').notNull(),
    gradeLevel: t.text('gradeLevel').notNull(),
    subject: t.text('subject').notNull(),
    /** Denormalized counter — kept in sync by admin scenario create/delete routes. */
    scenarioCount: t.integer('scenarioCount').notNull().default(0),
    visibility: t.text('visibility').notNull().default('published'), // 'private' | 'shared' | 'published' | 'archived'
    createdBy: t
      .text('createdBy')
      .references(() => user.id, { onDelete: 'set null' }),
    updatedBy: t
      .text('updatedBy')
      .references(() => user.id, { onDelete: 'set null' }),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.index('idx_course_visibility').on(table.visibility),
    t.index('idx_course_createdBy').on(table.createdBy),
    t.index('idx_course_updatedBy').on(table.updatedBy),
    t.check(
      'check_course_visibility',
      sql`${table.visibility} IN ('private', 'shared', 'published', 'archived')`,
    ),
  ],
);

export const persona = t.sqliteTable(
  'persona',
  {
    id: t
      .text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: t.text('name').notNull(),
    description: t.text('description').notNull(),
    systemPrompt: t.text('systemPrompt').notNull(),
    createdBy: t
      .text('createdBy')
      .references(() => user.id, { onDelete: 'set null' }),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [t.index('idx_persona_createdBy').on(table.createdBy)],
);

export const scenario = t.sqliteTable(
  'scenario',
  {
    id: t.text('id').primaryKey(),
    courseId: t
      .text('courseId')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    title: t.text('title').notNull(),
    description: t.text('description').notNull(),
    observerPrompt: t.text('observerPrompt'),
    activityContext: t.text('activityContext'),
    model: t.text('model'),
    observerModel: t.text('observerModel'),
    observerMode: t.text('observerMode').default('panel'),
    createdBy: t
      .text('createdBy')
      .references(() => user.id, { onDelete: 'set null' }),
    updatedBy: t
      .text('updatedBy')
      .references(() => user.id, { onDelete: 'set null' }),
    sortOrder: t.integer('sortOrder').notNull().default(0),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.index('idx_scenario_courseId').on(table.courseId),
    t.index('idx_scenario_createdBy').on(table.createdBy),
    t.index('idx_scenario_updatedBy').on(table.updatedBy),
  ],
);

export const scenarioAgent = t.sqliteTable(
  'scenarioAgent',
  {
    id: t
      .text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scenarioId: t
      .text('scenarioId')
      .notNull()
      .references(() => scenario.id, { onDelete: 'cascade' }),
    personaId: t
      .text('personaId')
      .notNull()
      .references(() => persona.id, { onDelete: 'cascade' }),
    openingMessage: t.text('openingMessage'),
    sortOrder: t.integer('sortOrder').notNull().default(0),
    maxResponseTokens: t.integer('maxResponseTokens'),
  },
  (table) => [
    t.index('idx_scenarioAgent_scenarioId').on(table.scenarioId),
    t.index('idx_scenarioAgent_personaId').on(table.personaId),
    t
      .index('idx_scenarioAgent_scenarioId_sortOrder')
      .on(table.scenarioId, table.sortOrder),
    t
      .unique('uq_scenarioAgent_scenario_persona')
      .on(table.scenarioId, table.personaId),
  ],
);

export const conversation = t.sqliteTable(
  'conversation',
  {
    id: t.text('id').primaryKey(),
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scenarioId: t
      .text('scenarioId')
      .notNull()
      .references(() => scenario.id, { onDelete: 'restrict' }),
    status: t.text('status').notNull().default('active'), // 'active' | 'completed' | 'abandoned'
    startedAt: t
      .integer('startedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: t.integer('completedAt', { mode: 'timestamp' }),
    messageCount: t.integer('messageCount').notNull().default(0),
    observerMessageCount: t
      .integer('observerMessageCount')
      .notNull()
      .default(0),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.index('idx_conversation_userId').on(table.userId),
    t.index('idx_conversation_userId_status').on(table.userId, table.status),
    t.index('idx_conversation_scenarioId').on(table.scenarioId),
    t.index('idx_conversation_status').on(table.status),
    t.index('idx_conversation_updatedAt').on(table.updatedAt),
    t.index('idx_conversation_startedAt').on(table.startedAt),
    t
      .index('idx_conversation_userId_completedAt')
      .on(table.userId, table.completedAt),
    t.check(
      'check_conversation_status',
      sql`${table.status} IN ('active', 'completed', 'abandoned')`,
    ),
  ],
);

export const message = t.sqliteTable(
  'message',
  {
    id: t.text('id').primaryKey(),
    conversationId: t
      .text('conversationId')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    role: t.text('role').notNull(), // 'user' (teacher) | 'assistant' (student)
    content: t.text('content').notNull(),
    agentId: t
      .text('agentId')
      .references(() => persona.id, { onDelete: 'set null' }), // null for teacher messages
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    sortOrder: t.integer('sortOrder').notNull(),
  },
  (table) => [
    t.index('idx_message_conversationId').on(table.conversationId),
    t
      .index('idx_message_conversationId_sortOrder')
      .on(table.conversationId, table.sortOrder),
    t.index('idx_message_agentId').on(table.agentId),
    t.index('idx_message_createdAt').on(table.createdAt),
    t
      .index('idx_message_conversationId_createdAt')
      .on(table.conversationId, table.createdAt),
    t
      .unique('uq_message_conversation_sortOrder')
      .on(table.conversationId, table.sortOrder),
    t.check('check_message_role', sql`${table.role} IN ('user', 'assistant')`),
    t.check(
      'check_message_agentId_role',
      sql`(${table.role} != 'user' OR ${table.agentId} IS NULL)`,
    ),
  ],
);

export const observerMessage = t.sqliteTable(
  'observerMessage',
  {
    id: t
      .text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: t
      .text('conversationId')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    role: t.text('role').notNull(), // 'user' (teacher asks) | 'assistant' (observer responds)
    content: t.text('content').notNull(),
    sortOrder: t.integer('sortOrder').notNull(),
    createdAt: t
      .integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.index('idx_observerMessage_conversationId').on(table.conversationId),
    t
      .unique('uq_observerMessage_conversation_sortOrder')
      .on(table.conversationId, table.sortOrder),
    t.check(
      'check_observerMessage_role',
      sql`${table.role} IN ('user', 'assistant')`,
    ),
  ],
);

export const progress = t.sqliteTable(
  'progress',
  {
    id: t.text('id').primaryKey(),
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    courseId: t
      .text('courseId')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    scenarioId: t
      .text('scenarioId')
      .notNull()
      .references(() => scenario.id, { onDelete: 'cascade' }),
    status: t.text('status').notNull().default('not_started'),
    latestConversationId: t
      .text('latestConversationId')
      .references(() => conversation.id, { onDelete: 'set null' }),
    completedAt: t.integer('completedAt', { mode: 'timestamp' }),
    updatedAt: t
      .integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    t.unique().on(table.userId, table.scenarioId),
    t.index('idx_progress_userId').on(table.userId),
    t.index('idx_progress_courseId').on(table.courseId),
    t.index('idx_progress_userId_courseId').on(table.userId, table.courseId),
    t.index('idx_progress_scenarioId').on(table.scenarioId),
    t.check(
      'check_progress_status',
      sql`${table.status} IN ('not_started', 'in_progress', 'completed')`,
    ),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  conversations: many(conversation),
  progress: many(progress),
  personas: many(persona),
  createdAccessCodes: many(accessCode),
}));

export const accessCodeRelations = relations(accessCode, ({ one }) => ({
  creator: one(user, {
    fields: [accessCode.createdBy],
    references: [user.id],
  }),
}));

export const courseRelations = relations(course, ({ many }) => ({
  scenarios: many(scenario),
}));

export const personaRelations = relations(persona, ({ one, many }) => ({
  createdByUser: one(user, {
    fields: [persona.createdBy],
    references: [user.id],
  }),
  scenarioAgents: many(scenarioAgent),
}));

export const scenarioRelations = relations(scenario, ({ one, many }) => ({
  course: one(course, {
    fields: [scenario.courseId],
    references: [course.id],
  }),
  conversations: many(conversation),
  agents: many(scenarioAgent),
}));

export const scenarioAgentRelations = relations(scenarioAgent, ({ one }) => ({
  scenario: one(scenario, {
    fields: [scenarioAgent.scenarioId],
    references: [scenario.id],
  }),
  persona: one(persona, {
    fields: [scenarioAgent.personaId],
    references: [persona.id],
  }),
}));

export const conversationRelations = relations(
  conversation,
  ({ one, many }) => ({
    user: one(user, {
      fields: [conversation.userId],
      references: [user.id],
    }),
    scenario: one(scenario, {
      fields: [conversation.scenarioId],
      references: [scenario.id],
    }),
    messages: many(message),
    observerMessages: many(observerMessage),
  }),
);

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  agent: one(persona, {
    fields: [message.agentId],
    references: [persona.id],
  }),
}));

export const observerMessageRelations = relations(
  observerMessage,
  ({ one }) => ({
    conversation: one(conversation, {
      fields: [observerMessage.conversationId],
      references: [conversation.id],
    }),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const dailyBudget = t.sqliteTable(
  'dailyBudget',
  {
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: t.text('date').notNull(), // YYYY-MM-DD (UTC)
    count: t.integer('count').notNull().default(0),
  },
  (table) => [
    t.primaryKey({ columns: [table.userId, table.date] }),
    t.index('idx_dailyBudget_date').on(table.date),
  ],
);

export const progressRelations = relations(progress, ({ one }) => ({
  user: one(user, { fields: [progress.userId], references: [user.id] }),
  course: one(course, { fields: [progress.courseId], references: [course.id] }),
  scenario: one(scenario, {
    fields: [progress.scenarioId],
    references: [scenario.id],
  }),
}));
