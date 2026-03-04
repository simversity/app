/**
 * Generated Zod schemas from Drizzle tables via drizzle-zod.
 * Use these to validate API responses and derive frontend types
 * from a single source of truth (the database schema).
 *
 * Import these schemas in route handlers for response validation,
 * and use the inferred types in `src/types/api.ts` to keep
 * frontend/backend types aligned.
 */
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  accessCode,
  conversation,
  course,
  message,
  observerMessage,
  persona,
  progress,
  scenario,
  scenarioAgent,
  user,
} from './schema';

// --- Select schemas (for reading from DB) ---

export const selectUserSchema = createSelectSchema(user);
export const selectCourseSchema = createSelectSchema(course);
export const selectScenarioSchema = createSelectSchema(scenario);
export const selectPersonaSchema = createSelectSchema(persona);
export const selectScenarioAgentSchema = createSelectSchema(scenarioAgent);
export const selectConversationSchema = createSelectSchema(conversation);
export const selectMessageSchema = createSelectSchema(message);
export const selectObserverMessageSchema = createSelectSchema(observerMessage);
export const selectProgressSchema = createSelectSchema(progress);
export const selectAccessCodeSchema = createSelectSchema(accessCode);

// --- API response schemas (projections of the full schemas) ---

/** Course summary for public listing */
export const courseSummarySchema = selectCourseSchema.pick({
  id: true,
  title: true,
  description: true,
  gradeLevel: true,
  subject: true,
  scenarioCount: true,
});

/** Admin course with visibility and dates */
export const adminCourseSchema = courseSummarySchema.extend({
  visibility: z.enum(['private', 'shared', 'published', 'archived']),
  createdAt: z.union([z.string(), z.date()]),
});

/** Persona summary for listing */
export const personaSummarySchema = selectPersonaSchema.pick({
  id: true,
  name: true,
  description: true,
});

/** Persona detail including system prompt */
export const personaDetailSchema = personaSummarySchema.extend({
  systemPrompt: z.string(),
});

/** API message shape */
export const apiMessageSchema = selectMessageSchema
  .pick({
    id: true,
    role: true,
    content: true,
    agentId: true,
  })
  .extend({
    agentName: z.string().nullable().optional(),
  });

/** User entry for admin listing */
export const userEntrySchema = selectUserSchema.pick({
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
});

/** Profile data */
export const profileDataSchema = selectUserSchema.pick({
  id: true,
  name: true,
  email: true,
  role: true,
  gradeLevel: true,
  subjects: true,
  experienceYears: true,
  createdAt: true,
});

/** Model info (not DB-derived, defined directly) */
export const modelInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  context: z.string(),
  tier: z.enum(['$', '$$', '$$$']),
});

// --- Inferred types ---

export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type AdminCourseRow = z.infer<typeof adminCourseSchema>;
export type PersonaSummary = z.infer<typeof personaSummarySchema>;
export type PersonaDetailRow = z.infer<typeof personaDetailSchema>;
export type ApiMessageRow = z.infer<typeof apiMessageSchema>;
export type UserEntryRow = z.infer<typeof userEntrySchema>;
export type ProfileDataRow = z.infer<typeof profileDataSchema>;
export type ModelInfoRow = z.infer<typeof modelInfoSchema>;
