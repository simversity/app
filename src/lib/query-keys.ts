export const queryKeys = {
  appConfig: ['config', 'app'] as const,
  dashboard: ['dashboard'] as const,
  courses: ['courses'] as const,
  course: (id: string) => ['courses', id] as const,
  adminCourses: ['admin', 'courses'] as const,
  adminCourse: (id: string) => ['admin', 'courses', id] as const,
  courseScenarios: (courseId: string) =>
    ['admin', 'courses', courseId, 'scenarios'] as const,
  scenario: (id: string) => ['scenarios', id] as const,
  conversation: (id: string) => ['conversations', id] as const,
  personas: ['personas'] as const,
  persona: (id: string) => ['personas', id] as const,
  models: ['models'] as const,
  profile: ['profile'] as const,
  courseFiles: (courseId: string) =>
    ['admin', 'courses', courseId, 'files'] as const,
  scenarioFiles: (scenarioId: string) =>
    ['admin', 'scenarios', scenarioId, 'files'] as const,
  conversationFiles: (conversationId: string) =>
    ['conversations', conversationId, 'files'] as const,
  scenarioBuilder: (id: string) => ['scenario-builder', id] as const,
  accessCodes: ['access-codes'] as const,
  users: ['users'] as const,
  budgetStatus: ['budget', 'status'] as const,
  conversationList: (params?: Record<string, string | number>) =>
    ['conversations', 'list', params] as const,
  progress: ['progress'] as const,
};
