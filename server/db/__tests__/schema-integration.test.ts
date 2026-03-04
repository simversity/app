import { Database } from 'bun:sqlite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

/**
 * Integration tests for the schema against a real in-memory SQLite DB.
 * Validates foreign key constraints, unique constraints, check constraints,
 * and cascading deletes that unit tests with mocked DB cannot verify.
 *
 * Uses raw SQL to avoid importing the full drizzle schema (which triggers
 * relational config extraction that requires the real DB connection).
 */

let sqlite: Database;

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');

  // Create tables from schema DDL
  // We build the tables manually since we don't have drizzle-kit in test
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      gradeLevel TEXT,
      subjects TEXT,
      experienceYears INTEGER,
      role TEXT NOT NULL DEFAULT 'teacher',
      CHECK (role IN ('teacher', 'admin', 'super_admin'))
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expiresAt INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      gradeLevel TEXT NOT NULL,
      subject TEXT NOT NULL,
      scenarioCount INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'published',
      createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
      updatedBy TEXT REFERENCES user(id) ON DELETE SET NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      CHECK (visibility IN ('private', 'shared', 'published', 'archived'))
    );

    CREATE TABLE IF NOT EXISTS persona (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      systemPrompt TEXT NOT NULL,
      createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scenario (
      id TEXT PRIMARY KEY,
      courseId TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      observerPrompt TEXT,
      activityContext TEXT,
      model TEXT,
      observerModel TEXT,
      observerMode TEXT DEFAULT 'panel',
      createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
      updatedBy TEXT REFERENCES user(id) ON DELETE SET NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scenarioAgent (
      id TEXT PRIMARY KEY,
      scenarioId TEXT NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
      personaId TEXT NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
      openingMessage TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      maxResponseTokens INTEGER,
      UNIQUE(scenarioId, personaId)
    );

    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      scenarioId TEXT NOT NULL REFERENCES scenario(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active',
      startedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      completedAt INTEGER,
      messageCount INTEGER NOT NULL DEFAULT 0,
      observerMessageCount INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      CHECK (status IN ('active', 'completed', 'abandoned'))
    );

    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agentId TEXT REFERENCES persona(id) ON DELETE SET NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      sortOrder INTEGER NOT NULL,
      UNIQUE(conversationId, sortOrder),
      CHECK (role IN ('user', 'assistant'))
    );

    CREATE TABLE IF NOT EXISTS observerMessage (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(conversationId, sortOrder),
      CHECK (role IN ('user', 'assistant'))
    );

    CREATE TABLE IF NOT EXISTS progress (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      courseId TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
      scenarioId TEXT NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started',
      latestConversationId TEXT REFERENCES conversation(id) ON DELETE SET NULL,
      completedAt INTEGER,
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(userId, scenarioId),
      CHECK (status IN ('not_started', 'in_progress', 'completed'))
    );
  `);
});

afterAll(() => {
  sqlite.close();
});

beforeEach(() => {
  // Clear all data between tests (order matters due to FKs)
  sqlite.exec('DELETE FROM progress');
  sqlite.exec('DELETE FROM observerMessage');
  sqlite.exec('DELETE FROM message');
  sqlite.exec('DELETE FROM conversation');
  sqlite.exec('DELETE FROM scenarioAgent');
  sqlite.exec('DELETE FROM scenario');
  sqlite.exec('DELETE FROM course');
  sqlite.exec('DELETE FROM persona');
  sqlite.exec('DELETE FROM session');
  sqlite.exec('DELETE FROM user');
});

// Helper: seed a user
function seedUser(id = 'user-1', email = 'test@example.com') {
  sqlite.exec(
    `INSERT INTO user (id, name, email, role) VALUES ('${id}', 'Test', '${email}', 'teacher')`,
  );
}

// Helper: seed a course
function seedCourse(id = 'course-1') {
  sqlite.exec(
    `INSERT INTO course (id, title, description, gradeLevel, subject) VALUES ('${id}', 'Bio 101', 'Biology course', 'college', 'biology')`,
  );
}

// Helper: seed a persona
function seedPersona(id = 'persona-1') {
  sqlite.exec(
    `INSERT INTO persona (id, name, description, systemPrompt) VALUES ('${id}', 'Riley', 'Confident student', 'You are Riley.')`,
  );
}

// Helper: seed a scenario
function seedScenario(id = 'sc-1', courseId = 'course-1') {
  sqlite.exec(
    `INSERT INTO scenario (id, courseId, title, description, sortOrder) VALUES ('${id}', '${courseId}', 'Natural Selection', 'Practice scenario', 0)`,
  );
}

// Helper: seed a conversation
function seedConversation(
  id = 'conv-1',
  userId = 'user-1',
  scenarioId = 'sc-1',
) {
  sqlite.exec(
    `INSERT INTO conversation (id, userId, scenarioId, status) VALUES ('${id}', '${userId}', '${scenarioId}', 'active')`,
  );
}

describe('Foreign key constraints', () => {
  test('conversation requires valid userId', () => {
    seedUser();
    seedCourse();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO conversation (id, userId, scenarioId) VALUES ('conv-1', 'nonexistent', 'sc-1')",
      );
    }).toThrow();
  });

  test('conversation requires valid scenarioId', () => {
    seedUser();

    expect(() => {
      sqlite.exec(
        "INSERT INTO conversation (id, userId, scenarioId) VALUES ('conv-1', 'user-1', 'nonexistent')",
      );
    }).toThrow();
  });

  test('message requires valid conversationId', () => {
    expect(() => {
      sqlite.exec(
        "INSERT INTO message (id, conversationId, role, content, sortOrder) VALUES ('msg-1', 'nonexistent', 'user', 'Hello', 0)",
      );
    }).toThrow();
  });

  test('progress requires valid userId', () => {
    seedCourse();
    seedUser();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-1', 'nonexistent', 'course-1', 'sc-1')",
      );
    }).toThrow();
  });

  test('progress requires valid courseId', () => {
    seedUser();
    seedCourse();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-1', 'user-1', 'nonexistent', 'sc-1')",
      );
    }).toThrow();
  });

  test('progress requires valid scenarioId', () => {
    seedUser();
    seedCourse();

    expect(() => {
      sqlite.exec(
        "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-1', 'user-1', 'course-1', 'nonexistent')",
      );
    }).toThrow();
  });

  test('scenarioAgent requires valid scenarioId', () => {
    seedPersona();

    expect(() => {
      sqlite.exec(
        "INSERT INTO scenarioAgent (id, scenarioId, personaId) VALUES ('sa-1', 'nonexistent', 'persona-1')",
      );
    }).toThrow();
  });

  test('scenarioAgent requires valid personaId', () => {
    seedUser();
    seedCourse();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO scenarioAgent (id, scenarioId, personaId) VALUES ('sa-1', 'sc-1', 'nonexistent')",
      );
    }).toThrow();
  });
});

describe('Unique constraints', () => {
  test('user email must be unique', () => {
    seedUser('user-1', 'same@example.com');

    expect(() => {
      sqlite.exec(
        "INSERT INTO user (id, name, email, role) VALUES ('user-2', 'Other', 'same@example.com', 'teacher')",
      );
    }).toThrow();
  });

  test('progress userId + scenarioId must be unique', () => {
    seedUser();
    seedCourse();
    seedScenario();

    sqlite.exec(
      "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-1', 'user-1', 'course-1', 'sc-1')",
    );

    expect(() => {
      sqlite.exec(
        "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-2', 'user-1', 'course-1', 'sc-1')",
      );
    }).toThrow();
  });

  test('message conversationId + sortOrder must be unique', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    sqlite.exec(
      "INSERT INTO message (id, conversationId, role, content, sortOrder) VALUES ('msg-1', 'conv-1', 'user', 'Hello', 0)",
    );

    expect(() => {
      sqlite.exec(
        "INSERT INTO message (id, conversationId, role, content, sortOrder) VALUES ('msg-2', 'conv-1', 'assistant', 'Hi', 0)",
      );
    }).toThrow();
  });

  test('observerMessage conversationId + sortOrder must be unique', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    sqlite.exec(
      "INSERT INTO observerMessage (id, conversationId, role, content, sortOrder) VALUES ('obs-1', 'conv-1', 'user', 'How am I?', 0)",
    );

    expect(() => {
      sqlite.exec(
        "INSERT INTO observerMessage (id, conversationId, role, content, sortOrder) VALUES ('obs-2', 'conv-1', 'assistant', 'Great', 0)",
      );
    }).toThrow();
  });

  test('scenarioAgent scenarioId + personaId must be unique', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedPersona();

    sqlite.exec(
      "INSERT INTO scenarioAgent (id, scenarioId, personaId) VALUES ('sa-1', 'sc-1', 'persona-1')",
    );

    expect(() => {
      sqlite.exec(
        "INSERT INTO scenarioAgent (id, scenarioId, personaId) VALUES ('sa-2', 'sc-1', 'persona-1')",
      );
    }).toThrow();
  });
});

describe('Check constraints', () => {
  test('user role must be valid', () => {
    expect(() => {
      sqlite.exec(
        "INSERT INTO user (id, name, email, role) VALUES ('u-1', 'Test', 'a@b.com', 'invalid_role')",
      );
    }).toThrow();
  });

  test('user role accepts all valid values', () => {
    for (const [i, role] of ['teacher', 'admin', 'super_admin'].entries()) {
      sqlite.exec(
        `INSERT INTO user (id, name, email, role) VALUES ('u-${i}', 'Test ${i}', 'user${i}@test.com', '${role}')`,
      );
    }
    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM user').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(3);
  });

  test('conversation status must be valid', () => {
    seedUser();
    seedCourse();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO conversation (id, userId, scenarioId, status) VALUES ('conv-1', 'user-1', 'sc-1', 'invalid')",
      );
    }).toThrow();
  });

  test('conversation status accepts all valid values', () => {
    seedUser();
    seedCourse();
    seedScenario();

    for (const [i, status] of ['active', 'completed', 'abandoned'].entries()) {
      sqlite.exec(
        `INSERT INTO conversation (id, userId, scenarioId, status) VALUES ('conv-${i}', 'user-1', 'sc-1', '${status}')`,
      );
    }
    const rows = sqlite
      .query('SELECT COUNT(*) as cnt FROM conversation')
      .get() as { cnt: number };
    expect(rows.cnt).toBe(3);
  });

  test('message role must be valid', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    expect(() => {
      sqlite.exec(
        "INSERT INTO message (id, conversationId, role, content, sortOrder) VALUES ('msg-1', 'conv-1', 'system', 'Bad', 0)",
      );
    }).toThrow();
  });

  test('observerMessage role must be valid', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    expect(() => {
      sqlite.exec(
        "INSERT INTO observerMessage (id, conversationId, role, content, sortOrder) VALUES ('obs-1', 'conv-1', 'system', 'Bad', 0)",
      );
    }).toThrow();
  });

  test('progress status must be valid', () => {
    seedUser();
    seedCourse();
    seedScenario();

    expect(() => {
      sqlite.exec(
        "INSERT INTO progress (id, userId, courseId, scenarioId, status) VALUES ('prog-1', 'user-1', 'course-1', 'sc-1', 'invalid')",
      );
    }).toThrow();
  });

  test('progress status accepts all valid values', () => {
    seedUser();
    seedCourse();

    for (const [i, status] of [
      'not_started',
      'in_progress',
      'completed',
    ].entries()) {
      seedScenario(`sc-prog-${i}`, 'course-1');
      sqlite.exec(
        `INSERT INTO progress (id, userId, courseId, scenarioId, status) VALUES ('prog-${i}', 'user-1', 'course-1', 'sc-prog-${i}', '${status}')`,
      );
    }
    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM progress').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(3);
  });

  test('course visibility must be valid', () => {
    expect(() => {
      sqlite.exec(
        "INSERT INTO course (id, title, description, gradeLevel, subject, visibility) VALUES ('c-1', 'Test', 'Desc', 'college', 'bio', 'invalid')",
      );
    }).toThrow();
  });
});

describe('Cascading deletes', () => {
  test('deleting user cascades to conversations', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    sqlite.exec("DELETE FROM user WHERE id = 'user-1'");

    const rows = sqlite
      .query('SELECT COUNT(*) as cnt FROM conversation')
      .get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });

  test('deleting user cascades to sessions', () => {
    seedUser();
    sqlite.exec(
      "INSERT INTO session (id, expiresAt, token, userId) VALUES ('sess-1', 9999999999, 'tok-1', 'user-1')",
    );

    sqlite.exec("DELETE FROM user WHERE id = 'user-1'");

    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM session').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(0);
  });

  test('deleting conversation cascades to messages', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();
    sqlite.exec(
      "INSERT INTO message (id, conversationId, role, content, sortOrder) VALUES ('msg-1', 'conv-1', 'user', 'Hello', 0)",
    );

    sqlite.exec("DELETE FROM conversation WHERE id = 'conv-1'");

    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM message').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(0);
  });

  test('deleting conversation cascades to observerMessages', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();
    sqlite.exec(
      "INSERT INTO observerMessage (id, conversationId, role, content, sortOrder) VALUES ('obs-1', 'conv-1', 'user', 'How am I?', 0)",
    );

    sqlite.exec("DELETE FROM conversation WHERE id = 'conv-1'");

    const rows = sqlite
      .query('SELECT COUNT(*) as cnt FROM observerMessage')
      .get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });

  test('deleting course cascades to scenarios', () => {
    seedUser();
    seedCourse();
    seedScenario();

    sqlite.exec("DELETE FROM course WHERE id = 'course-1'");

    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM scenario').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(0);
  });

  test('deleting scenario cascades to scenarioAgents', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedPersona();
    sqlite.exec(
      "INSERT INTO scenarioAgent (id, scenarioId, personaId) VALUES ('sa-1', 'sc-1', 'persona-1')",
    );

    sqlite.exec("DELETE FROM scenario WHERE id = 'sc-1'");

    const rows = sqlite
      .query('SELECT COUNT(*) as cnt FROM scenarioAgent')
      .get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });

  test('deleting scenario is restricted when conversations exist', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();

    expect(() => {
      sqlite.exec("DELETE FROM scenario WHERE id = 'sc-1'");
    }).toThrow();
  });

  test('deleting user cascades to progress', () => {
    seedUser();
    seedCourse();
    seedScenario();
    sqlite.exec(
      "INSERT INTO progress (id, userId, courseId, scenarioId) VALUES ('prog-1', 'user-1', 'course-1', 'sc-1')",
    );

    sqlite.exec("DELETE FROM user WHERE id = 'user-1'");

    const rows = sqlite.query('SELECT COUNT(*) as cnt FROM progress').get() as {
      cnt: number;
    };
    expect(rows.cnt).toBe(0);
  });

  test('deleting conversation sets progress latestConversationId to null', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedConversation();
    sqlite.exec(
      "INSERT INTO progress (id, userId, courseId, scenarioId, latestConversationId) VALUES ('prog-1', 'user-1', 'course-1', 'sc-1', 'conv-1')",
    );

    sqlite.exec("DELETE FROM conversation WHERE id = 'conv-1'");

    const row = sqlite
      .query("SELECT latestConversationId FROM progress WHERE id = 'prog-1'")
      .get() as { latestConversationId: string | null };
    expect(row.latestConversationId).toBeNull();
  });

  test('deleting persona sets message agentId to null', () => {
    seedUser();
    seedCourse();
    seedScenario();
    seedPersona();
    seedConversation();
    sqlite.exec(
      "INSERT INTO message (id, conversationId, role, content, agentId, sortOrder) VALUES ('msg-1', 'conv-1', 'assistant', 'Hello', 'persona-1', 0)",
    );

    sqlite.exec("DELETE FROM persona WHERE id = 'persona-1'");

    const row = sqlite
      .query("SELECT agentId FROM message WHERE id = 'msg-1'")
      .get() as { agentId: string | null };
    expect(row.agentId).toBeNull();
  });
});
