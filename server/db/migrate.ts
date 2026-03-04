import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { log } from '../lib/logger';

const dbUrl = process.env.DATABASE_URL || 'sqlite.db';
const sqlite = new Database(dbUrl);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

const db = drizzle({ client: sqlite });

try {
  migrate(db, { migrationsFolder: './server/db/migrations' });
  log.info('Migrations completed successfully');
} catch (err) {
  log.error({ error: err }, 'Migration failed');
  process.exit(1);
} finally {
  sqlite.close();
}
