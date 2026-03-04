/**
 * DB seed/reset helpers for route integration tests.
 */

import * as schema from '../db/schema';
import { testDb, testSqlite } from './preload';
import {
  ADMIN,
  SUPER_ADMIN,
  TEACHER,
  TEACHER_2,
  UNVERIFIED_TEACHER,
} from './test-users';

// ---------------------------------------------------------------------------
// Constant UUIDs for seeded entities
// ---------------------------------------------------------------------------
export const TEST_IDS = {
  course1: '10000000-0000-4000-a000-000000000001',
  course2: '10000000-0000-4000-a000-000000000002',
  scenario1: '20000000-0000-4000-a000-000000000001',
  scenario2: '20000000-0000-4000-a000-000000000002',
  persona1: '30000000-0000-4000-a000-000000000001',
  persona2: '30000000-0000-4000-a000-000000000002',
  agent1: '40000000-0000-4000-a000-000000000001',
  agent2: '40000000-0000-4000-a000-000000000002',
  accessCode1: '50000000-0000-4000-a000-000000000001',
  conversation1: '60000000-0000-4000-a000-000000000001',
};

const now = new Date();

// ---------------------------------------------------------------------------
// resetDb — delete all rows from all tables in FK-safe order
// ---------------------------------------------------------------------------
export function resetDb() {
  testSqlite.exec('PRAGMA foreign_keys = OFF');
  testSqlite.exec('DELETE FROM observerMessage');
  testSqlite.exec('DELETE FROM message');
  testSqlite.exec('DELETE FROM progress');
  testSqlite.exec('DELETE FROM conversation');
  testSqlite.exec('DELETE FROM scenarioAgent');
  testSqlite.exec('DELETE FROM scenario');
  testSqlite.exec('DELETE FROM course');
  testSqlite.exec('DELETE FROM persona');
  testSqlite.exec('DELETE FROM accessCode');
  testSqlite.exec('DELETE FROM dailyBudget');
  testSqlite.exec('DELETE FROM verification');
  testSqlite.exec('DELETE FROM session');
  testSqlite.exec('DELETE FROM account');
  testSqlite.exec('DELETE FROM user');
  testSqlite.exec('PRAGMA foreign_keys = ON');
}

// ---------------------------------------------------------------------------
// seedUsers — insert test users into the DB
// ---------------------------------------------------------------------------
export function seedUsers() {
  const users = [TEACHER, ADMIN, SUPER_ADMIN, UNVERIFIED_TEACHER, TEACHER_2];
  for (const u of users) {
    testDb
      .insert(schema.user)
      .values({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        role: u.role,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// seedMinimal — users + 1 course + 1 persona + 1 scenario + 1 agent
// ---------------------------------------------------------------------------
export function seedMinimal() {
  seedUsers();

  testDb
    .insert(schema.course)
    .values({
      id: TEST_IDS.course1,
      title: 'Biology 101',
      description: 'Introduction to Biology',
      gradeLevel: '9-12',
      subject: 'Biology',
      scenarioCount: 1,
      visibility: 'published',
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  testDb
    .insert(schema.persona)
    .values({
      id: TEST_IDS.persona1,
      name: 'Riley',
      description: 'A curious biology student',
      systemPrompt:
        'You are Riley, a biology student who is confused about evolution.',
      createdBy: ADMIN.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  testDb
    .insert(schema.scenario)
    .values({
      id: TEST_IDS.scenario1,
      courseId: TEST_IDS.course1,
      title: 'Evolution Misconception',
      description: 'Student thinks humans evolved from monkeys',
      observerPrompt: 'Observe the teaching interaction',
      activityContext: 'Biology class discussion',
      observerMode: 'panel',
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  testDb
    .insert(schema.scenarioAgent)
    .values({
      id: TEST_IDS.agent1,
      scenarioId: TEST_IDS.scenario1,
      personaId: TEST_IDS.persona1,
      openingMessage:
        'Hi teacher! I heard that humans evolved from monkeys. Is that true?',
      sortOrder: 0,
    })
    .run();
}

// ---------------------------------------------------------------------------
// seedAdmin — extends seedMinimal with extra entities for admin tests
// ---------------------------------------------------------------------------
export function seedAdmin() {
  seedMinimal();

  // Second course (archived)
  testDb
    .insert(schema.course)
    .values({
      id: TEST_IDS.course2,
      title: 'Chemistry 101',
      description: 'Introduction to Chemistry',
      gradeLevel: '10-12',
      subject: 'Chemistry',
      scenarioCount: 0,
      visibility: 'archived',
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Second persona
  testDb
    .insert(schema.persona)
    .values({
      id: TEST_IDS.persona2,
      name: 'Jordan',
      description: 'An overconfident student',
      systemPrompt:
        'You are Jordan, a student who is overly confident about wrong answers.',
      createdBy: ADMIN.id,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Access code (unused)
  testDb
    .insert(schema.accessCode)
    .values({
      id: TEST_IDS.accessCode1,
      code: 'test-invite-123',
      role: 'teacher',
      createdBy: ADMIN.id,
      createdAt: now,
    })
    .run();
}

// ---------------------------------------------------------------------------
// seedConversation — adds a conversation with messages for a teacher
// ---------------------------------------------------------------------------
export function seedConversation(opts?: {
  status?: string;
  messageCount?: number;
}) {
  const status = opts?.status ?? 'active';
  const msgCount = opts?.messageCount ?? 2;

  testDb
    .insert(schema.conversation)
    .values({
      id: TEST_IDS.conversation1,
      userId: TEACHER.id,
      scenarioId: TEST_IDS.scenario1,
      status,
      startedAt: now,
      completedAt: status === 'completed' ? now : null,
      messageCount: msgCount,
      observerMessageCount: 0,
      updatedAt: now,
    })
    .run();

  // Insert opening message from agent
  testDb
    .insert(schema.message)
    .values({
      id: crypto.randomUUID(),
      conversationId: TEST_IDS.conversation1,
      role: 'assistant',
      content:
        'Hi teacher! I heard that humans evolved from monkeys. Is that true?',
      agentId: TEST_IDS.persona1,
      sortOrder: 0,
      createdAt: now,
    })
    .run();

  // Insert teacher response if msgCount >= 2
  if (msgCount >= 2) {
    testDb
      .insert(schema.message)
      .values({
        id: crypto.randomUUID(),
        conversationId: TEST_IDS.conversation1,
        role: 'user',
        content:
          "That's a great question! Let me explain how evolution actually works.",
        agentId: null,
        sortOrder: 1,
        createdAt: now,
      })
      .run();
  }

  // If we need more messages, add pairs
  for (let i = 2; i < msgCount; i++) {
    testDb
      .insert(schema.message)
      .values({
        id: crypto.randomUUID(),
        conversationId: TEST_IDS.conversation1,
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `Message ${i}`,
        agentId: i % 2 === 0 ? TEST_IDS.persona1 : null,
        sortOrder: i,
        createdAt: now,
      })
      .run();
  }
}
