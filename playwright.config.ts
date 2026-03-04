import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Load .env so tests share the same environment as the server
const configDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

try {
  const envFile = readFileSync(resolve(configDir, '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // .env may not exist in CI
}

// Raise auth rate limits so test registrations/logins don't get throttled
process.env.TEST_MODE = '1';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-results.json' }],
      ]
    : [['list'], ['html', { open: 'on-failure' }]],
  timeout: 60_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
  webServer: [
    {
      // Mock AI server for deterministic, fast E2E tests
      command: 'bun server/ai/mock-server.ts',
      port: 4100,
      reuseExistingServer: true,
    },
    {
      // DB setup: reset and recreate before the server opens a handle.
      command:
        'rm -f sqlite.db sqlite.db-wal sqlite.db-shm sqlite.db-journal && bun run db:push && TEST_MODE=1 bun server/db/seed.ts && TEST_MODE=1 MOCK_AI=1 bun server/index.ts',
      port: 3001,
      reuseExistingServer: true,
    },
    {
      command: 'bun run dev:ui',
      port: 3000,
      reuseExistingServer: true,
    },
  ],
});
