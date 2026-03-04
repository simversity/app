import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalSetup() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  // Playwright starts webServer BEFORE globalSetup. If Playwright launched the
  // server (i.e. reuseExistingServer didn't skip it), the server already holds
  // an open handle on the DB file. We CANNOT delete the file in that case.
  //
  // Strategy: always run db:push (idempotent for existing tables) then seed
  // (uses upserts). This works whether the DB is fresh or has stale data.
  //
  // If the DB file doesn't exist at all (e.g. deleted manually), the server
  // will have failed to start. In that case we create it here and the retry
  // from Playwright will pick it up.
  try {
    execSync('bun run db:push', { cwd: root, stdio: 'pipe' });
  } catch (err) {
    // db:push may fail with "index already exists" on a populated DB — safe to ignore
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('already exists')) {
      console.warn('[global-setup] db:push failed:', msg);
    }
  }

  execSync('TEST_MODE=1 bun server/db/seed.ts', { cwd: root, stdio: 'pipe' });

  // Pre-warm Rsbuild routes so the first admin-ui test doesn't pay the
  // compilation cost (which can exceed 90s on cold starts).
  const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
  const warmRoutes = ['/', '/login', '/dashboard'];
  await Promise.allSettled(
    warmRoutes.map((path) =>
      fetch(`${baseURL}${path}`).catch(() => {
        /* ignore — server may not be ready yet */
      }),
    ),
  );
}
