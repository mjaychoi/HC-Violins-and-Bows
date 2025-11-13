#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL 환경 변수가 필요합니다." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Running SQL migrations against: $DATABASE_URL"

shopt -s nullglob
SQL_FILES=(
  "$ROOT_DIR"/*.sql
  "$ROOT_DIR"/migrations/*.sql
)

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  echo "No SQL files found. Place *.sql in repo root or migrations/" >&2
  exit 0
fi

for sql in "${SQL_FILES[@]}"; do
  echo "Applying: $(basename "$sql")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql"
done

echo "All migrations applied successfully."

