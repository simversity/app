/**
 * Predefined test users and request helpers for route tests.
 */
import { registerTestUser } from './preload';

// ---------------------------------------------------------------------------
// Test user definitions
// ---------------------------------------------------------------------------
export const TEACHER = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Teacher',
  email: 'teacher@test.com',
  emailVerified: true,
  role: 'teacher' as const,
};

export const ADMIN = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Test Admin',
  email: 'admin@test.com',
  emailVerified: true,
  role: 'admin' as const,
};

export const SUPER_ADMIN = {
  id: '00000000-0000-0000-0000-000000000003',
  name: 'Super Admin',
  email: 'super@test.com',
  emailVerified: true,
  role: 'super_admin' as const,
};

export const UNVERIFIED_TEACHER = {
  id: '00000000-0000-0000-0000-000000000004',
  name: 'Unverified Teacher',
  email: 'unverified@test.com',
  emailVerified: false,
  role: 'teacher' as const,
};

export const TEACHER_2 = {
  id: '00000000-0000-0000-0000-000000000005',
  name: 'Teacher Two',
  email: 'teacher2@test.com',
  emailVerified: true,
  role: 'teacher' as const,
};

type TestUser =
  | typeof TEACHER
  | typeof ADMIN
  | typeof SUPER_ADMIN
  | typeof UNVERIFIED_TEACHER
  | typeof TEACHER_2;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/** Returns headers that identify the request as coming from this user. */
export function asUser(user: TestUser): RequestInit {
  return { headers: { 'X-Test-User-Id': user.id } };
}

/** POST request with JSON body, authenticated as the given user. */
export function jsonPost(body: unknown, user: TestUser): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-User-Id': user.id,
    },
    body: JSON.stringify(body),
  };
}

/** PATCH request with JSON body, authenticated as the given user. */
export function jsonPatch(body: unknown, user: TestUser): RequestInit {
  return {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-User-Id': user.id,
    },
    body: JSON.stringify(body),
  };
}

/** DELETE request, authenticated as the given user. */
export function deleteReq(user: TestUser): RequestInit {
  return {
    method: 'DELETE',
    headers: { 'X-Test-User-Id': user.id },
  };
}

/** Register all predefined test users in the auth mock. */
export function registerAllTestUsers() {
  registerTestUser(TEACHER);
  registerTestUser(ADMIN);
  registerTestUser(SUPER_ADMIN);
  registerTestUser(UNVERIFIED_TEACHER);
  registerTestUser(TEACHER_2);
}
