# Non-Production Authorization Matrix

Real HTTP / PostgREST / RLS integration tests for HC Violins and Bows.

## Safety

- **Never** point these scripts at production.
- Production project ref is configured via `PRODUCTION_SUPABASE_PROJECT_REF`
  (identifier, not a credential). The auth-matrix and staging guards fail closed
  when it is missing in hosted/CI mode or when a URL targets that ref.
- Do not commit JWTs, service role keys, or passwords.
- Do not hard-code a production project ref in source.

## Authentication contract (important)

The Next.js app authenticates API routes via **cookie-backed Supabase SSR sessions** (`withAuthRoute` reads cookies, not `Authorization: Bearer`).

The interim smoke harness in `matrix.test.ts` sends Bearer tokens for local debugging only. That does **not** match the browser auth contract and will produce **401** against the real app.

Before treating matrix failures as middleware bugs, verify:

```text
failed requests carried Supabase auth cookies (not Bearer-only)
cookie name/value format matches the app SSR client
cookies were issued by the staging Supabase project
expiry / aud / iss match the staging project
```

Planned hosted CI path (job `auth-matrix` in `.github/workflows/hosted-staging-integration.yml`):

```text
workflow creates synthetic users + org fixtures at runtime
mints real Supabase session cookies
runs matrix with cookie-backed requests
always cleans up fixtures/users
never stores JWTs or fixture UUIDs in GitHub secrets
```

Do **not** widen API auth to accept Bearer tokens solely to pass tests without an explicit product/security decision.

## Local environment variables

| Variable                        | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `AUTH_MATRIX_ENABLED`           | Set to `1` to run integration tests locally         |
| `AUTH_MATRIX_SUPABASE_URL`      | Staging/local Supabase URL                          |
| `AUTH_MATRIX_SUPABASE_ANON_KEY` | Anon key for the staging project                    |
| `AUTH_MATRIX_SERVICE_ROLE_KEY`  | Service role for fixture bootstrap only             |
| `AUTH_MATRIX_BASE_URL`          | Running app base URL (e.g. `http://127.0.0.1:3000`) |

Interim local-only Bearer tokens (not used by hosted CI):

| Variable                       | Purpose                  |
| ------------------------------ | ------------------------ |
| `AUTH_MATRIX_JWT_ORG_A_ADMIN`  | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_A_MEMBER` | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_ADMIN`  | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_MEMBER` | Local smoke Bearer token |

Optional IDs after seeding (local or runtime bootstrap):

| Variable                          | Purpose                         |
| --------------------------------- | ------------------------------- |
| `AUTH_MATRIX_ORG_A_INSTRUMENT_ID` | Same-org instrument for matrix  |
| `AUTH_MATRIX_ORG_B_INSTRUMENT_ID` | Cross-org instrument for matrix |

## Bootstrap (local Supabase)

```bash
supabase start
supabase db reset --local --no-seed
npm run dev
npx tsx scripts/auth-matrix/seed-fixtures.ts
```

Mint sessions with Supabase Auth using `app_metadata.org_id` and `app_metadata.role`.

## Run matrix (local interim Bearer harness)

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

Hosted CI auth-matrix job is **opt-in** via repository variable `AUTH_MATRIX_READY=true` and requires `scripts/auth-matrix/run-hosted-matrix.ts` (cookie-backed follow-up). Until then the job is skipped and needs no JWT secrets.
