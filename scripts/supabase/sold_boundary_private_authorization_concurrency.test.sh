#!/usr/bin/env bash
# Concurrency checks for the private, transaction-scoped Sold-boundary
# authorization mechanism (requirement 14: concurrent operations cannot
# consume or reuse one another's authorization records).
#
# Requires a disposable DB with the full migration chain applied through
# supabase/migrations/20260804020000_harden_sale_lifecycle_authorization.sql
# (see scripts/supabase/instrument_sold_boundary_test_bootstrap.sql).
#
# Usage:
#   DATABASE_URL=postgresql:///hc_sold_boundary_verify \
#     bash scripts/supabase/sold_boundary_private_authorization_concurrency.test.sh
set -euo pipefail

DB="${DATABASE_URL:-postgresql:///hc_sold_boundary_verify}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

ORG='e0000000-0000-4000-8000-000000000201'
CLIENT='e1000000-0000-4000-8000-000000000201'
USER_ADMIN='11111111-1111-4111-8111-300000000001'
INST_X='fc000000-0000-4000-8000-000000000001'
INST_Y='fc000000-0000-4000-8000-000000000002'
INST_SAME='fc000000-0000-4000-8000-000000000003'

setup_sql="$WORKDIR/setup.sql"
worker_diff_x_sql="$WORKDIR/worker_diff_x.sql"
worker_diff_y_sql="$WORKDIR/worker_diff_y.sql"
worker_same_sql="$WORKDIR/worker_same.sql"
verify_sql="$WORKDIR/verify.sql"

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
VALUES ('${ORG}', 'Private Auth Concurrency Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, org_id, name, first_name, last_name)
VALUES ('${CLIENT}', '${ORG}', 'Private Auth Concurrency Client', 'Private Auth', 'Concurrency Client')
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.sales_history WHERE instrument_id IN ('${INST_X}', '${INST_Y}', '${INST_SAME}');
DELETE FROM public.instruments WHERE id IN ('${INST_X}', '${INST_Y}', '${INST_SAME}');

INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
VALUES
  ('${INST_X}', '${ORG}', 'Violin', 'PRIVCONC-X', 'Available', 1000),
  ('${INST_Y}', '${ORG}', 'Violin', 'PRIVCONC-Y', 'Available', 1000),
  ('${INST_SAME}', '${ORG}', 'Violin', 'PRIVCONC-SAME', 'Available', 1000);
SQL

psql "$DB" -v ON_ERROR_STOP=1 -f "$setup_sql"

set_jwt_stmt() {
  cat <<SQL
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '${USER_ADMIN}',
    'role', 'authenticated',
    'app_metadata', json_build_object('org_id', '${ORG}', 'role', 'admin')
  )::text,
  false
);
SQL
}

# ============================================================
# Part 1: two DIFFERENT instruments sold concurrently. If a concurrent
# transaction could ever see (and thus consume) another transaction's
# uncommitted sale_auth row, this is where it would show up as a
# spuriously-successful cross-instrument authorization or a duplicate/
# missing sale. Both must succeed independently.
# ============================================================
{
  set_jwt_stmt
  cat <<SQL
SELECT public.create_sale_atomic(900, CURRENT_DATE, '${CLIENT}'::uuid, '${INST_X}'::uuid, 'concurrent X');
SQL
} >"$worker_diff_x_sql"

{
  set_jwt_stmt
  cat <<SQL
SELECT public.create_sale_atomic(950, CURRENT_DATE, '${CLIENT}'::uuid, '${INST_Y}'::uuid, 'concurrent Y');
SQL
} >"$worker_diff_y_sql"

out_x="$WORKDIR/diff_x.txt"
out_y="$WORKDIR/diff_y.txt"

(psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_diff_x_sql" >"$out_x" 2>&1) &
pid_x=$!
(psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_diff_y_sql" >"$out_y" 2>&1) &
pid_y=$!

set +e
wait "$pid_x"; rc_x=$?
wait "$pid_y"; rc_y=$?
set -e

if [[ $rc_x -ne 0 || $rc_y -ne 0 ]]; then
  echo "FAIL: expected both concurrent different-instrument sells to succeed"
  echo "--- X ($rc_x) ---"; cat "$out_x"
  echo "--- Y ($rc_y) ---"; cat "$out_y"
  exit 1
fi

cat >"$verify_sql" <<SQL
\\set ON_ERROR_STOP on
DO \$\$
DECLARE
  v_status_x TEXT;
  v_status_y TEXT;
  v_sales_x INTEGER;
  v_sales_y INTEGER;
  v_leftover INTEGER;
BEGIN
  SELECT status INTO v_status_x FROM public.instruments WHERE id = '${INST_X}';
  SELECT status INTO v_status_y FROM public.instruments WHERE id = '${INST_Y}';
  IF v_status_x <> 'Sold' THEN RAISE EXCEPTION 'part1: instrument X not Sold, got %', v_status_x; END IF;
  IF v_status_y <> 'Sold' THEN RAISE EXCEPTION 'part1: instrument Y not Sold, got %', v_status_y; END IF;

  SELECT COUNT(*) INTO v_sales_x FROM public.sales_history WHERE instrument_id = '${INST_X}' AND entry_kind = 'sale';
  SELECT COUNT(*) INTO v_sales_y FROM public.sales_history WHERE instrument_id = '${INST_Y}' AND entry_kind = 'sale';
  IF v_sales_x <> 1 THEN RAISE EXCEPTION 'part1: expected exactly 1 sale row for X, got %', v_sales_x; END IF;
  IF v_sales_y <> 1 THEN RAISE EXCEPTION 'part1: expected exactly 1 sale row for Y, got %', v_sales_y; END IF;

  SELECT COUNT(*) INTO v_leftover FROM sale_auth.sold_transition_authorization
  WHERE instrument_id IN ('${INST_X}', '${INST_Y}');
  IF v_leftover <> 0 THEN RAISE EXCEPTION 'part1: % leftover authorization row(s) after concurrent sells', v_leftover; END IF;

  RAISE NOTICE 'part 1 PASSED (two concurrent different-instrument sells both succeeded independently, no cross-consumption, no leftover authorization)';
END \$\$;
SQL

psql "$DB" -v ON_ERROR_STOP=1 -f "$verify_sql"

# ============================================================
# Part 2: two concurrent attempts to sell the SAME instrument. Exactly
# one must win (serialized by the instrument's FOR UPDATE lock inside
# create_sale_atomic); the loser must fail on the "already sold" business
# check, not on some authorization mixup, and no authorization row must
# be left behind by either side.
# ============================================================
{
  set_jwt_stmt
  cat <<SQL
SELECT public.create_sale_atomic(900 + (random()*10)::int, CURRENT_DATE, '${CLIENT}'::uuid, '${INST_SAME}'::uuid, 'concurrent same A');
SQL
} >"$worker_same_sql"

out_a="$WORKDIR/same_a.txt"
out_b="$WORKDIR/same_b.txt"

(psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_same_sql" >"$out_a" 2>&1) &
pid_a=$!
(sleep 0.05; psql "$DB" -v ON_ERROR_STOP=1 -f "$worker_same_sql" >"$out_b" 2>&1) &
pid_b=$!

set +e
wait "$pid_a"; rc_a=$?
wait "$pid_b"; rc_b=$?
set -e

success_count=0
[[ $rc_a -eq 0 ]] && success_count=$((success_count + 1))
[[ $rc_b -eq 0 ]] && success_count=$((success_count + 1))

if [[ $success_count -ne 1 ]]; then
  echo "FAIL: expected exactly one concurrent same-instrument sell to succeed, got $success_count"
  echo "--- A ($rc_a) ---"; cat "$out_a"
  echo "--- B ($rc_b) ---"; cat "$out_b"
  exit 1
fi

if [[ $rc_a -ne 0 ]] && ! grep -q "already sold" "$out_a"; then
  echo "FAIL: loser A did not fail with the expected 'already sold' business error"
  cat "$out_a"
  exit 1
fi
if [[ $rc_b -ne 0 ]] && ! grep -q "already sold" "$out_b"; then
  echo "FAIL: loser B did not fail with the expected 'already sold' business error"
  cat "$out_b"
  exit 1
fi

cat >"$verify_sql" <<SQL
\\set ON_ERROR_STOP on
DO \$\$
DECLARE
  v_status TEXT;
  v_sales INTEGER;
  v_leftover INTEGER;
BEGIN
  SELECT status INTO v_status FROM public.instruments WHERE id = '${INST_SAME}';
  IF v_status <> 'Sold' THEN RAISE EXCEPTION 'part2: instrument not Sold, got %', v_status; END IF;

  SELECT COUNT(*) INTO v_sales FROM public.sales_history WHERE instrument_id = '${INST_SAME}' AND entry_kind = 'sale';
  IF v_sales <> 1 THEN RAISE EXCEPTION 'part2: expected exactly 1 sale row, got %', v_sales; END IF;

  SELECT COUNT(*) INTO v_leftover FROM sale_auth.sold_transition_authorization
  WHERE instrument_id = '${INST_SAME}';
  IF v_leftover <> 0 THEN RAISE EXCEPTION 'part2: % leftover authorization row(s) after contended sell', v_leftover; END IF;

  RAISE NOTICE 'part 2 PASSED (exactly one of two concurrent same-instrument sells won, loser saw the business check not an auth mixup, no leftover authorization)';
END \$\$;
SQL

psql "$DB" -v ON_ERROR_STOP=1 -f "$verify_sql"

echo "sold_boundary_private_authorization_concurrency tests PASSED"
