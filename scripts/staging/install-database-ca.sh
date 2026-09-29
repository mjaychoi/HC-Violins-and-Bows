#!/usr/bin/env bash
# Writes the hosted staging Supabase CA to a runner-temp file and exports
# DATABASE_CA_CERT_PATH / DATABASE_CA_CERT_REQUIRED for later PostgreSQL
# clients. Certificate contents are never printed.
set -euo pipefail

if [[ -z "${STAGING_DATABASE_CA_CERT:-}" ]]; then
  echo "STAGING_DATABASE_CA_CERT is required for hosted staging PostgreSQL certificate verification." >&2
  exit 1
fi

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  echo "RUNNER_TEMP is required to store the staging database CA outside the workspace." >&2
  exit 1
fi

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV is required to pass the staging database CA path to later steps." >&2
  exit 1
fi

dest="${RUNNER_TEMP}/staging-database-ca.crt"
umask 077
printf '%s\n' "$STAGING_DATABASE_CA_CERT" >"$dest"
chmod 600 "$dest"

if ! grep -q -- '-----BEGIN CERTIFICATE-----' "$dest"; then
  rm -f "$dest"
  echo "STAGING_DATABASE_CA_CERT is not a PEM certificate. Refusing to continue." >&2
  exit 1
fi

{
  printf 'DATABASE_CA_CERT_PATH=%s\n' "$dest"
  printf 'DATABASE_CA_CERT_REQUIRED=true\n'
} >>"$GITHUB_ENV"

echo "Installed staging database CA for certificate verification (contents not printed)."
