export const queryKeys = {
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
  accessCodes: ['access-codes'] as const,
  users: ['users'] as const,
};
