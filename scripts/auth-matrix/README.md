# Non-Production Authorization Matrix

Real HTTP / PostgREST / RLS integration tests for HC Violins and Bows.

## Safety

- **Never** point these scripts at production.
- Production Supabase ref `dmilmlhquttcozxlpfxw` is blocklisted in `tests/integration/auth-matrix/env-guard.ts`.
- Do not commit JWTs, service role keys, or passwords.

## Authentication contract (important)

The Next.js app authenticates API routes via **cookie-backed Supabase SSR sessions** (`withAuthRoute` reads cookies, not `Authorization: Bearer`).

The current smoke harness in `matrix.test.ts` sends Bearer tokens for convenience. That does **not** match the browser auth contract and will produce **401** even when staging credentials are valid.

Before treating matrix failures as middleware bugs, verify:

```text
failed requests carried Supabase auth cookies (not Bearer-only)
cookie name/value format matches the app SSR client
cookies were issued by the staging Supabase project
expiry / aud / iss match the staging project
```

Planned harness fix: mint real sessions and attach cookies. Do **not** widen API auth to accept Bearer tokens solely to pass tests without an explicit product/security decision.

## Environment variables (CI-safe names only)

| Variable | Purpose |
|----------|---------|
| `AUTH_MATRIX_ENABLED` | Set to `1` to run integration tests |
| `AUTH_MATRIX_SUPABASE_URL` | Staging/local Supabase URL |
| `AUTH_MATRIX_SUPABASE_ANON_KEY` | Anon key for the staging project |
| `AUTH_MATRIX_SERVICE_ROLE_KEY` | Service role for fixture bootstrap only |
| `AUTH_MATRIX_BASE_URL` | Running app base URL (e.g. `http://127.0.0.1:3000`) |
| `AUTH_MATRIX_JWT_ORG_A_ADMIN` | **Interim** Bearer token for smoke tests |
| `AUTH_MATRIX_JWT_ORG_A_MEMBER` | **Interim** Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_ADMIN` | **Interim** Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_MEMBER` | **Interim** Bearer token |

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

Mint sessions with Supabase Auth using `app_metadata.org_id` and `app_metadata.role`.

## Run matrix

```bash
AUTH_MATRIX_ENABLED=1 npm test -- --runInBand tests/integration/auth-matrix/matrix.test.ts
```

## Cleanup / reset

```bash
npx tsx scripts/auth-matrix/cleanup-fixtures.ts
./scripts/auth-matrix/reset-environment.sh
```

`reset-environment.sh` runs `supabase db reset --local --no-seed` and re-applies all repository migrations.

## CI

Workflow: `.github/workflows/hosted-staging-integration.yml`

Runs only when repository secrets are configured and `workflow_dispatch` is triggered. Aborts if project ref matches production.
