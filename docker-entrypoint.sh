#!/bin/sh
set -e

# ── Pre-flight checks ────────────────────────────────────────────────
DB_PATH="${DATABASE_URL:-/data/sqlite.db}"
DB_DIR=$(dirname "$DB_PATH")

if [ ! -d "$DB_DIR" ]; then
  echo "ERROR: Database directory '$DB_DIR' does not exist."
  exit 1
fi

# Verify the directory is writable (touch a temp file)
if ! touch "$DB_DIR/.entrypoint-check" 2>/dev/null; then
  echo "ERROR: Database directory '$DB_DIR' is not writable."
  exit 1
fi
rm -f "$DB_DIR/.entrypoint-check"

# ── Database migrations with retry ───────────────────────────────────
MAX_RETRIES=3
RETRY_DELAY=2

for attempt in $(seq 1 $MAX_RETRIES); do
  echo "Running database migrations (attempt $attempt/$MAX_RETRIES)..."
  if bun server/db/migrate.ts; then
    echo "Migrations completed successfully."
    break
  fi

  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: Database migration failed after $MAX_RETRIES attempts."
    exit 1
  fi

  echo "Migration failed. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
  RETRY_DELAY=$((RETRY_DELAY * 2))
done

# ── Start server ─────────────────────────────────────────────────────
echo "Starting server..."
exec bun server/index.ts
