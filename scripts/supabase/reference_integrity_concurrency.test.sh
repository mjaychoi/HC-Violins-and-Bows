#!/usr/bin/env bash
# Concurrent reserved_connection_id pointer vs connection retarget regression.
# Requires two independent DB sessions against a local Supabase Postgres.
#
# Usage:
#   export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
#   scripts/supabase/reference_integrity_concurrency.test.sh
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ref-integrity-concurrency.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

SESSION_A="$TMP_DIR/session_a.sql"
SESSION_B="$TMP_DIR/session_b.sql"
RESULT_A="$TMP_DIR/result_a.txt"
RESULT_B="$TMP_DIR/result_b.txt"

cat >"$SESSION_A" <<'SQL'
\set ON_ERROR_STOP off
BEGIN;
UPDATE public.instruments
SET reserved_connection_id = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid
WHERE id = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid;
SELECT pg_sleep(0.35);
COMMIT;
SQL

cat >"$SESSION_B" <<'SQL'
\set ON_ERROR_STOP off
BEGIN;
SELECT pg_sleep(0.05);
UPDATE public.client_instruments
SET instrument_id = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'::uuid
WHERE id = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid;
COMMIT;
SQL

echo "Preparing concurrency fixture..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SETUP'
BEGIN;

DELETE FROM public.maintenance_tasks
WHERE instrument_id IN (
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid,
  'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'::uuid
);

DELETE FROM public.instruments
WHERE id IN (
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid,
  'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'::uuid
);

DELETE FROM public.client_instruments
WHERE id = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid;

DELETE FROM public.clients
WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'::uuid;

DELETE FROM public.organizations
WHERE id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid;

INSERT INTO public.organizations (id, name)
VALUES ('e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid, 'Concurrency Org');

INSERT INTO public.clients (id, org_id, name)
VALUES (
  'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'::uuid,
  'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid,
  'Concurrency Client'
);

INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
  (
    'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid,
    'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid,
    'Violin',
    'CONC-A',
    'Available'
  ),
  (
    'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'::uuid,
    'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid,
    'Violin',
    'CONC-B',
    'Available'
  );

INSERT INTO public.client_instruments (
  id, org_id, client_id, instrument_id, relationship_type
) VALUES (
  'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid,
  'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid,
  'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'::uuid,
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid,
  'Interested'
);

UPDATE public.instruments
SET reserved_connection_id = NULL
WHERE id = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid;

COMMIT;
SETUP

echo "Running concurrent pointer-set vs retarget sessions..."
psql "$DATABASE_URL" -f "$SESSION_A" >"$RESULT_A" 2>&1 &
PID_A=$!
psql "$DATABASE_URL" -f "$SESSION_B" >"$RESULT_B" 2>&1 &
PID_B=$!

wait "$PID_A" || true
wait "$PID_B" || true

echo "--- session A (pointer set) ---"
cat "$RESULT_A"
echo "--- session B (connection retarget) ---"
cat "$RESULT_B"

MISMATCH_COUNT="$(
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT COUNT(*)
FROM public.instruments i
JOIN public.client_instruments ci
  ON ci.id = i.reserved_connection_id
WHERE i.reserved_connection_id IS NOT NULL
  AND (
    i.org_id IS DISTINCT FROM ci.org_id
    OR i.id IS DISTINCT FROM ci.instrument_id
  );
SQL
)"

if [[ "$MISMATCH_COUNT" != "0" ]]; then
  echo "FAIL: aggregate reserved_connection mismatch_count=$MISMATCH_COUNT" >&2
  exit 1
fi

# At least one concurrent path must have been blocked or rejected.
COMBINED="$(cat "$RESULT_A" "$RESULT_B")"
if ! grep -Eiq 'ERROR|same instrument|Cannot retarget|Referenced client_instruments connection not found' <<<"$COMBINED"; then
  # Both may succeed only when serialized without conflict; verify pointer cleared or consistent.
  CONSISTENT="$(
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT CASE
  WHEN (
    SELECT reserved_connection_id
    FROM public.instruments
    WHERE id = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid
  ) IS NULL THEN 1
  WHEN EXISTS (
    SELECT 1
    FROM public.instruments i
    JOIN public.client_instruments ci ON ci.id = i.reserved_connection_id
    WHERE i.id = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid
      AND i.org_id = ci.org_id
      AND i.id = ci.instrument_id
  ) THEN 1
  ELSE 0
END;
SQL
  )"
  if [[ "$CONSISTENT" != "1" ]]; then
    echo "FAIL: neither session reported an error and final pointer state is inconsistent" >&2
    exit 1
  fi
fi

echo "Cleaning up concurrency fixture..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'CLEANUP'
BEGIN;
UPDATE public.instruments
SET reserved_connection_id = NULL
WHERE id = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid;
DELETE FROM public.client_instruments
WHERE id = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid;
DELETE FROM public.instruments
WHERE id IN (
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'::uuid,
  'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'::uuid
);
DELETE FROM public.clients
WHERE id = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'::uuid;
DELETE FROM public.organizations
WHERE id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'::uuid;
COMMIT;
CLEANUP

echo "reference integrity concurrency tests passed"
