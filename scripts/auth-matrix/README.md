# Non-Production Authorization Matrix

Real JWT / PostgREST / RLS integration tests for HC Violins and Bows.

## Safety

- **Never** point these scripts at production.
- Production Supabase ref `dmilmlhquttcozxlpfxw` is blocklisted in `tests/integration/auth-matrix/env-guard.ts`.
- Do not commit JWTs, service role keys, or passwords.

## Environment variables (CI-safe names only)

| Variable | Purpose |
|----------|---------|
| `AUTH_MATRIX_ENABLED` | Set to `1` to run integration tests |
| `AUTH_MATRIX_SUPABASE_URL` | Staging/local Supabase URL |
| `AUTH_MATRIX_SUPABASE_ANON_KEY` | Anon key for the staging project |
| `AUTH_MATRIX_SERVICE_ROLE_KEY` | Service role for fixture bootstrap only |
| `AUTH_MATRIX_BASE_URL` | Running app base URL (e.g. `http://127.0.0.1:3000`) |
| `AUTH_MATRIX_JWT_ORG_A_ADMIN` | Admin JWT for Org A |
| `AUTH_MATRIX_JWT_ORG_A_MEMBER` | Member JWT for Org A |
| `AUTH_MATRIX_JWT_ORG_B_ADMIN` | Admin JWT for Org B |
| `AUTH_MATRIX_JWT_ORG_B_MEMBER` | Member JWT for Org B |

Optional IDs after seeding:

| Variable | Purpose |
|----------|---------|
| `AUTH_MATRIX_ORG_A_ID` | Org A UUID |
| `AUTH_MATRIX_ORG_B_ID` | Org B UUID |
| `AUTH_MATRIX_ORG_A_INSTRUMENT_ID` | Same-org instrument for matrix |
| `AUTH_MATRIX_ORG_B_INSTRUMENT_ID` | Cross-org instrument for matrix |

## Bootstrap (local Supabase)

```bash
supabase start
supabase db reset --local --no-seed
npm run dev
npx tsx scripts/auth-matrix/seed-fixtures.ts
```

Mint JWTs with Supabase Auth using `app_metadata.org_id` and `app_metadata.role`, then export the `AUTH_MATRIX_JWT_*` variables.

## Run matrix

```bash
AUTH_MATRIX_ENABLED=1 npm test -- --runInBand --testPathPatterns=auth-matrix
```

## Cleanup / reset

```bash
npx tsx scripts/auth-matrix/cleanup-fixtures.ts
./scripts/auth-matrix/reset-environment.sh
```

`reset-environment.sh` runs `supabase db reset --local --no-seed` and re-applies all repository migrations.

## CI

Workflow: `.github/workflows/auth-matrix-integration.yml`

Runs only when repository secrets are configured and `workflow_dispatch` is triggered. Aborts if project ref matches production.
