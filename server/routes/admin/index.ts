import { Hono } from 'hono';
import { RATE_LIMIT_ADMIN } from '../../lib/env';
import { createRateLimiter } from '../../lib/rate-limit';
import { tooManyRequests } from '../../lib/responses';
import type { AppEnv } from '../../lib/types';
import { requireAdmin } from '../../middleware/auth';
import { adminAccessCodeRoutes } from './access-codes';
import { adminCourseRoutes } from './courses';
import {
  adminCourseFileRoutes,
  adminFileByIdRoutes,
  adminScenarioFileRoutes,
} from './files';
import { adminPersonaRoutes } from './personas';
import { adminScenarioByIdRoutes, adminScenarioRoutes } from './scenarios';
import { adminUserRoutes } from './users';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireAdmin);

const checkAdminRateLimit = createRateLimiter(RATE_LIMIT_ADMIN);
adminRoutes.use('*', async (c, next) => {
  const user = c.get('user');
  if (!checkAdminRateLimit(user.id)) {
    return tooManyRequests(c);
  }
  return next();
});

adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/access-codes', adminAccessCodeRoutes);
adminRoutes.route('/courses', adminCourseRoutes);
adminRoutes.route('/courses/:courseId/scenarios', adminScenarioRoutes);
adminRoutes.route('/scenarios', adminScenarioByIdRoutes);
adminRoutes.route('/personas', adminPersonaRoutes);
adminRoutes.route('/courses/:courseId/files', adminCourseFileRoutes);
adminRoutes.route('/scenarios/:scenarioId/files', adminScenarioFileRoutes);
adminRoutes.route('/files', adminFileByIdRoutes);
