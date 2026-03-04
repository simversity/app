import { eq } from 'drizzle-orm';
import { COURSE, deterministicUUID, SCENARIOS } from '../ai/scenarios';
import { auth } from '../auth';
import { log } from '../lib/logger';
import { db } from './index';
import {
  conversation,
  course,
  persona,
  progress,
  scenario,
  scenarioAgent,
  user,
} from './schema';

if (process.env.NODE_ENV === 'production') {
  log.error('Refusing to seed production database');
  process.exit(1);
}

async function seed() {
  log.info('Seeding database...');

  await db.transaction(async (tx) => {
    // Upsert course
    await tx
      .insert(course)
      .values({
        id: COURSE.id,
        title: COURSE.title,
        description: COURSE.description,
        gradeLevel: 'undergraduate',
        subject: COURSE.subject,
        scenarioCount: COURSE.scenarioCount,
        visibility: 'published',
      })
      .onConflictDoUpdate({
        target: course.id,
        set: {
          title: COURSE.title,
          description: COURSE.description,
          subject: COURSE.subject,
          scenarioCount: COURSE.scenarioCount,
        },
      });

    // Legacy IDs from previous seed runs (string-format + old Sam solo scenario)
    const legacyScenarioIds = [
      'riley-natural-selection',
      'sam-natural-selection',
    ];
    const oldSamScenarioId = deterministicUUID('sam-natural-selection');
    const legacyCourseId = 'natural-selection-101';

    // Delete dependent records before removing scenarios (conversation/progress have RESTRICT FK)
    const allScenarioIds = [
      ...SCENARIOS.map((s) => s.id),
      ...legacyScenarioIds,
      oldSamScenarioId,
    ];
    for (const sid of allScenarioIds) {
      await tx.delete(scenarioAgent).where(eq(scenarioAgent.scenarioId, sid));
      await tx
        .delete(scenarioAgent)
        .where(eq(scenarioAgent.personaId, `persona-${sid}`));
      await tx.delete(conversation).where(eq(conversation.scenarioId, sid));
    }
    await tx.delete(progress).where(eq(progress.courseId, COURSE.id));
    await tx.delete(progress).where(eq(progress.courseId, legacyCourseId));
    for (const sid of allScenarioIds) {
      await tx.delete(scenario).where(eq(scenario.id, sid));
    }
    await tx.delete(scenario).where(eq(scenario.courseId, COURSE.id));
    await tx.delete(scenario).where(eq(scenario.courseId, legacyCourseId));
    await tx.delete(course).where(eq(course.id, legacyCourseId));
    // Remove old string-format persona IDs and old per-scenario persona IDs
    for (const sid of legacyScenarioIds) {
      await tx.delete(persona).where(eq(persona.id, `persona-${sid}`));
    }
    // Clean up old per-scenario-UUID persona IDs (from before personaKey migration)
    const oldRileyScenarioId = deterministicUUID('riley-natural-selection');
    for (const oldId of [oldRileyScenarioId, oldSamScenarioId]) {
      await tx
        .delete(persona)
        .where(eq(persona.id, deterministicUUID(`persona-${oldId}`)));
    }

    // Pass 1: Upsert unique personas keyed by personaKey (shared across scenarios)
    const allAgents = SCENARIOS.flatMap((s) => s.agents);
    const seenPersonaKeys = new Set<string>();
    for (const agent of allAgents) {
      if (seenPersonaKeys.has(agent.personaKey)) continue;
      seenPersonaKeys.add(agent.personaKey);
      const personaId = deterministicUUID(`persona-${agent.personaKey}`);
      await tx
        .insert(persona)
        .values({
          id: personaId,
          name: agent.studentName,
          description: agent.misconception,
          systemPrompt: agent.systemPrompt,
        })
        .onConflictDoUpdate({
          target: persona.id,
          set: {
            name: agent.studentName,
            description: agent.misconception,
            systemPrompt: agent.systemPrompt,
            updatedAt: new Date(),
          },
        });
    }

    // Pass 2: Upsert scenarios and create scenarioAgent join records
    for (const s of SCENARIOS) {
      await tx
        .insert(scenario)
        .values({
          id: s.id,
          courseId: s.courseId,
          title: s.title,
          description: s.description,
          activityContext:
            'Natural selection scenario — students work through misconceptions about how traits change in populations over generations.',
          sortOrder: s.sortOrder,
        })
        .onConflictDoUpdate({
          target: scenario.id,
          set: {
            title: s.title,
            description: s.description,
            sortOrder: s.sortOrder,
            updatedAt: new Date(),
          },
        });

      for (const agent of s.agents) {
        const personaId = deterministicUUID(`persona-${agent.personaKey}`);
        await tx.insert(scenarioAgent).values({
          scenarioId: s.id,
          personaId,
          openingMessage: agent.openingMessage,
          sortOrder: agent.sortOrder,
        });
      }
    }

    // Promote the first user to super_admin if one exists
    const users = await tx.select().from(user).limit(1);
    if (users.length > 0) {
      await tx
        .update(user)
        .set({ role: 'super_admin' })
        .where(eq(user.id, users[0].id));
      log.info({ email: users[0].email }, 'Promoted user to super_admin');
    }
  });

  const uniquePersonas = new Set(
    SCENARIOS.flatMap((s) => s.agents.map((a) => a.personaKey)),
  ).size;
  log.info(
    { courses: 1, scenarios: SCENARIOS.length, personas: uniquePersonas },
    'Seed complete',
  );

  // Create a test user only when TEST_MODE or TEST_USER_PASSWORD is set (CI/dev)
  if (process.env.TEST_MODE === '1' || process.env.TEST_USER_PASSWORD) {
    const testUser = {
      name: 'Test Teacher',
      email: 'test@university.edu',
      password: process.env.TEST_USER_PASSWORD || crypto.randomUUID(),
    };
    try {
      await auth.api.signUpEmail({ body: testUser });
      log.info({ email: testUser.email }, 'Test user created');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already exists') || msg.includes('UNIQUE')) {
        log.info({ email: testUser.email }, 'Test user already exists');
      } else {
        log.error({ error: msg }, 'Failed to create test user');
        process.exit(1);
      }
    }

    // Mark test user's email as verified so E2E tests can log in directly
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, testUser.email));
    log.info({ email: testUser.email }, 'Test user email verified');
  } else {
    log.info('Skipping test user (set TEST_MODE=1 to create one)');
  }
}

seed().catch((err) => {
  log.error({ error: err instanceof Error ? err.message : err }, 'Seed failed');
  process.exit(1);
});
