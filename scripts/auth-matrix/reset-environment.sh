#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Resetting local Supabase and replaying repository migrations..."
supabase db reset --local --no-seed
npm run check:migrations

echo "Local auth-matrix environment reset complete."
