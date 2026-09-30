#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  echo "STAGING_DATABASE_URL is required." >&2
  exit 1
fi

# Non-destructive database postflight. Hosted rehearsal checks staging
# identity and rejects production and local targets. It does not require
# STAGING_APP_BASE_URL. Regression files may change rows only inside a
# transaction that ends in ROLLBACK. Persistent backfill SQL is not run.
npx tsx scripts/staging/env-guard-cli.ts --hosted-rehearsal >/dev/null

DB_URL="$STAGING_DATABASE_URL"

if [[ "${DATABASE_CA_CERT_REQUIRED:-}" == "true" && -z "${DATABASE_CA_CERT_PATH:-}" ]]; then
  echo "DATABASE_CA_CERT_PATH is required for hosted PostgreSQL certificate verification." >&2
  exit 1
fi

# libpq sslmode=require does not verify the server certificate. When the
# hosted CA is present, rewrite only the TLS parameters to verify-full.
# Do not print DB_URL.
if [[ -n "${DATABASE_CA_CERT_PATH:-}" ]]; then
  DB_URL="$(DATABASE_URL="$DB_URL" npx tsx scripts/production/format-libpq-verify-full-url.ts)"
fi

AUDITS=(
  scripts/supabase/tenant_reference_consistency.test.sql
  scripts/supabase/reference_integrity.test.sql
  scripts/supabase/reference_integrity_role_context.test.sql
  scripts/supabase/client_rpc_authenticated_runtime_compatibility.test.sql
  scripts/supabase/final_security_audit_readonly.sql
  scripts/supabase/final_security_audit_pg17_guard.sql
  scripts/supabase/production_hardening_audit.sql
  scripts/supabase/tenant_isolation_audit_readonly.sql
  scripts/supabase/release_validation_audit.sql
)

for audit in "${AUDITS[@]}"; do
  echo "Running ${audit}..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$audit"
done

echo "All non-persistent staging postflight audits passed."
