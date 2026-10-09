#!/usr/bin/env bash
# Install only the protected production Environment's trusted database CA.
# Never print certificate contents or fall back to a staging certificate.
set -euo pipefail

if [[ -z "${PRODUCTION_DATABASE_CA_CERT:-}" ]]; then
  echo "PRODUCTION_DATABASE_CA_CERT is required for production PostgreSQL certificate verification." >&2
  exit 1
fi
if [[ -z "${RUNNER_TEMP:-}" || -z "${GITHUB_ENV:-}" ]]; then
  echo "RUNNER_TEMP and GITHUB_ENV are required to install the production database CA." >&2
  exit 1
fi

dest="${RUNNER_TEMP}/production-database-ca.crt"
umask 077
printf '%s\n' "$PRODUCTION_DATABASE_CA_CERT" >"$dest"
chmod 600 "$dest"
if ! openssl x509 -in "$dest" -noout >/dev/null 2>&1; then
  rm -f "$dest"
  echo "PRODUCTION_DATABASE_CA_CERT is not a valid PEM certificate. Refusing to continue." >&2
  exit 1
fi

{
  printf 'DATABASE_CA_CERT_PATH=%s\n' "$dest"
  printf 'DATABASE_CA_CERT_REQUIRED=true\n'
} >>"$GITHUB_ENV"
echo "Installed production database CA for certificate and hostname verification (contents not printed)."
