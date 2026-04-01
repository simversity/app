// ============================================================================
// Shared API response types
// These types describe the contract between frontend and backend.
// Import from '@/types/api' in frontend, or '../../src/types/api' in server.
//
// Database-derived Zod schemas live in server/db/schema-types.ts (via drizzle-zod).
// The types below are kept for frontend use; they are structurally identical to
// the Zod-inferred types. Over time, complex types can be replaced with imports
// from schema-types.ts to enforce a single source of truth.
// ============================================================================

// --- Core entities ---

export type Course = {
  id: string;
  title: string;
  description: string;
  gradeLevel: string;
  subject: string;
  scenarioCount: number;
};

export type CourseDetail = Course & {
  scenarios: Scenario[];
  visibility?: string;
  createdBy?: string;
};

export type CourseVisibility = 'private' | 'shared' | 'published' | 'archived';

export type AdminCourse = Course & {
  visibility: CourseVisibility;
  createdAt: string;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  studentName: string;
  openingMessage: string;
};

export type AdminScenario = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  observerPrompt: string | null;
  activityContext: string | null;
  observerMode: string | null;
  model: string | null;
  observerModel: string | null;
  agents: ScenarioAgentDetail[];
};

export type ScenarioAgentDetail = {
  personaId: string;
  openingMessage: string | null;
  persona: { id: string; name: string };
};

/** Persona summary returned by /api/admin/personas (list view). */
export type Persona = {
  id: string;
  name: string;
  description: string;
};

export type PersonaDetail = Persona & {
  systemPrompt: string;
};

export type AdminPersona = Persona & {
  createdAt: string;
};

/** Local form state for scenario agent entries (admin editors). */
export type AgentEntry = {
  _key: string;
  personaId: string;
  openingMessage: string;
  maxResponseTokens: number | null;
};

// --- Conversation detail ---

/** Conversation detail returned by GET /api/conversations/:id. */
export type ConversationDetail = {
  id: string;
  status: string;
  messageCount: number;
  startedAt: string;
  completedAt: string | null;
  scenario: {
    id: string;
    title: string;
    courseId: string;
    studentName?: string;
  };
  messages: ApiMessageWithAgent[];
};

/** Scenario summary used in the admin course editor. */
export type CourseEditorScenario = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  agents: { id: string; persona: { id: string; name: string } }[];
};

/** Course with visibility, used in admin course editor. */
export type CourseEditorCourse = {
  id: string;
  title: string;
  description: string;
  gradeLevel: string;
  subject: string;
  visibility: string;
};

// --- API message types ---

/** Message shape from SSE streaming and POST /api/conversations. */
export type MessageRole = 'user' | 'assistant';

export type ApiMessage = {
  id: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  agentName?: string | null;
};

/** Message shape from GET /api/conversations/:id (includes Drizzle agent relation). */
export type ApiMessageWithAgent = Omit<ApiMessage, 'agentName'> & {
  agent?: { name: string } | null;
};

// --- User types ---

export type UserRole = 'teacher' | 'admin' | 'super_admin';

export type UserEntry = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

export type ProfileData = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  gradeLevel: string | null;
  subjects: string | null;
  experienceYears: number | null;
  createdAt: string;
};

// --- Dashboard ---

export type DashboardSummary = {
  totalConversations: number;
  totalScenariosPracticed: number;
  totalCourses: number;
  totalMessages: number;
  recentConversations: RecentConversation[];
};

export type ConversationStatus = 'active' | 'completed' | 'abandoned';

export type RecentConversation = {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  studentName: string;
  courseId: string;
  messageCount: number;
  status: ConversationStatus;
  startedAt: string;
};

// --- File uploads ---

export type UploadedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  nearaiFileId: string | null;
  createdAt: string;
};

// --- Model info ---

export type ModelInfo = {
  id: string;
  label: string;
  context: string;
  tier: '$' | '$$' | '$$$';
};
