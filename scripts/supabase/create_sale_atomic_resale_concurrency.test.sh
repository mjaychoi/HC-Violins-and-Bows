#!/usr/bin/env bash
# Concurrent create_sale_atomic checks (tests 10–11).
# Requires a disposable DB prepared like create_sale_atomic_resale.test.sql.
#
# Usage:
#   DATABASE_URL=postgresql:///hc_sale_resale_verify \
#     bash scripts/supabase/create_sale_atomic_resale_concurrency.test.sh
set -euo pipefail

DB="${DATABASE_URL:-postgresql:///hc_sale_resale_verify}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

setup_sql="$WORKDIR/setup.sql"
worker_sql="$WORKDIR/worker.sql"

ORG='a0000000-0000-4000-8000-000000000001'
CLIENT='c0000000-0000-4000-8000-000000000001'
USER_ADMIN='11111111-1111-4111-8111-111111111111'
INST_FIRST='d0000000-0000-4000-8000-00000000c010'
INST_RESALE='d0000000-0000-4000-8000-00000000c011'

cat >"$setup_sql" <<SQL
\\set ON_ERROR_STOP on
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '${USER_ADMIN}',
    'role', 'authenticated',
    'app_metadata', json_build_object('org_id', '${ORG}', 'role', 'admin')
  )::text,
  false
);

INSERT INTO public.organizations (id, name)
VALUES ('${ORG}', 'Resale Concurrency Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, org_id, name, first_name, last_name)
VALUES ('${CLIENT}', '${ORG}', 'Concurrency Client', 'Concurrency', 'Client')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
VALUES
  ('${INST_FIRST}', '${ORG}', 'Violin', 'CONC-FIRST-001', 'Available', 1000),
  ('${INST_RESALE}', '${ORG}', 'Violin', 'CONC-RESALE-001', 'Available', 1000)
ON CONFLICT (id) DO UPDATE SET status = 'Available';

DELETE FROM public.sales_history WHERE instrument_id IN ('${INST_FIRST}', '${INST_RESALE}');
UPDATE public.instruments SET status = 'Available'
WHERE id IN ('${INST_FIRST}', '${INST_RESALE}');

-- Seed a fully refunded cycle on INST_RESALE so concurrent resale is the next step.
SELECT public.create_sale_atomic(800, CURRENT_DATE, '${CLIENT}'::uuid, '${INST_RESALE}'::uuid, 'pre-resale');
SELECT public.update_instrument_sale_transition_atomic(
  '${INST_RESALE}'::uuid,
  jsonb_build_object('status', 'Available'),
  NULL, NULL, NULL, 'pre-resale refund',
  (SELECT updated_at FROM public.instruments WHERE id = '${INST_RESALE}'::uuid)
);
SQL

psql "$DB" -v ON_ERROR_STOP=1 -f "$setup_sql"

run_pair() {
  local instrument_id="$1"
  local label="$2"
  local out_a="$WORKDIR/${label}_a.txt"
  local out_b="$WORKDIR/${label}_b.txt"

  cat >"$worker_sql" <<SQL
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '${USER_ADMIN}',
    'role', 'authenticated',
    'app_metadata', json_build_object('org_id', '${ORG}', 'role', 'admin')
  )::text,
  false
);
SELECT public.create_sale_atomic(
  900 + (random()*10)::int,
  CURRENT_DATE,
  '${CLIENT}'::uuid,
  '${instrument_id}'::uuid,
  'concurrent ${label}'
);
SQL

  # Stagger slightly so both contend on FOR UPDATE of the same instrument.
  (psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_sql" >"$out_a" 2>&1) &
  pid_a=$!
  (sleep 0.05; psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_sql" >"$out_b" 2>&1) &
  pid_b=$!

  set +e
  wait "$pid_a"
  rc_a=$?
  wait "$pid_b"
  rc_b=$?
  set -e

  local success=0
  [[ $rc_a -eq 0 ]] && success=$((success + 1))
  [[ $rc_b -eq 0 ]] && success=$((success + 1))

  local active
  local count_sql="$WORKDIR/${label}_count.sql"
  cat >"$count_sql" <<SQL
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '${USER_ADMIN}',
    'role', 'authenticated',
    'app_metadata', json_build_object('org_id', '${ORG}', 'role', 'admin')
  )::text,
  true
);
SELECT COUNT(*)::text
FROM public.sales_history
WHERE instrument_id = '${instrument_id}'
  AND entry_kind = 'sale'
  AND public.sale_lifecycle_net_amount(id, '${ORG}'::uuid) > 0;
SQL
  active="$(psql "$DB" -At -f "$count_sql" | tail -n 1)"

  echo "[$label] success_count=$success active_sales=$active"
  if [[ "$success" -lt 1 || "$success" -gt 1 ]]; then
    echo "Expected exactly one successful concurrent sale for $label" >&2
    echo "--- worker A ---"; cat "$out_a" >&2
    echo "--- worker B ---"; cat "$out_b" >&2
    exit 1
  fi
  if [[ "$active" != "1" ]]; then
    echo "Expected exactly one active sale after concurrency for $label, got $active" >&2
    exit 1
  fi
}

run_pair "$INST_FIRST" "first_sale"
run_pair "$INST_RESALE" "resale"

echo "create_sale_atomic_resale concurrency tests 10-11 PASSED"
