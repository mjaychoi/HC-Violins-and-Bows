#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL 환경 변수가 필요합니다." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ACTIVE_MIGRATIONS_DIR="$ROOT_DIR/supabase/migrations"

echo "Running SQL migrations against: $DATABASE_URL"

shopt -s nullglob
SQL_FILES=(
  "$ACTIVE_MIGRATIONS_DIR"/[0-9]*_*.sql
)

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  echo "No deployable timestamped SQL files found under supabase/migrations/" >&2
  exit 0
fi

for sql in "${SQL_FILES[@]}"; do
  echo "Applying: $(basename "$sql")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql"
done

echo "All migrations applied successfully."
