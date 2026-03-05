import { eq } from 'drizzle-orm';
import { COURSE, deterministicUUID, SCENARIOS } from '../ai/scenarios';
import { log } from '../lib/logger';
import { db } from './index';
import { course, persona, scenario, scenarioAgent } from './schema';

/**
 * Production-safe seed: upserts course, scenarios, and personas.
 * Does NOT create test users or promote admins.
 */
async function seedProd() {
  log.info('Seeding production course data...');

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

    // Upsert unique personas
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

    // Upsert scenarios and create scenarioAgent join records
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

      // Clear existing agents for this scenario, then re-insert
      await tx.delete(scenarioAgent).where(eq(scenarioAgent.scenarioId, s.id));

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
  });

  const uniquePersonas = new Set(
    SCENARIOS.flatMap((s) => s.agents.map((a) => a.personaKey)),
  ).size;
  log.info(
    { courses: 1, scenarios: SCENARIOS.length, personas: uniquePersonas },
    'Production seed complete',
  );
}

seedProd().catch((err) => {
  log.error(
    { error: err instanceof Error ? err.message : err },
    'Production seed failed',
  );
  process.exit(1);
});
