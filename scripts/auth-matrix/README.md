# Non-Production Authorization Matrix

Real HTTP / PostgREST / RLS integration tests for HC Violins and Bows.

## Safety

- **Never** point these scripts at production.
- Production project ref is configured via `PRODUCTION_SUPABASE_PROJECT_REF`
  (identifier, not a credential). The auth-matrix and staging guards fail closed
  when it is missing in hosted/CI mode or when a URL targets that ref.
- Do not commit JWTs, service role keys, passwords, or serialized auth cookies.
- Do not hard-code a production project ref in source.

## Authentication contract (important)

The Next.js app authenticates API routes via **cookie-backed Supabase SSR sessions** (`withAuthRoute` reads cookies, not `Authorization: Bearer`).

`scripts/auth-matrix/run-hosted-matrix.ts` is the authoritative harness:

- creates unique synthetic organizations/instruments/clients per run
- creates four synthetic Supabase Auth users (`org_id` / `role` in `app_metadata`)
- mints real sessions with `signInWithPassword` (anon key, never service-role)
- serializes the app's `hcv-sb-auth` cookie via `serializeSupabaseAuthCookieChunks`
- sends `Cookie` headers only — never `Authorization: Bearer`
- always cleans the exact runtime manifest in `finally`
- the workflow `always()` step is a second, idempotent fallback

Runtime users are synthetic. Passwords are generated ephemerally in memory and
never stored in GitHub secrets. No JWT GitHub secrets are required.

`tests/integration/auth-matrix/matrix.test.ts` is a **NON-AUTHORITATIVE** local
interim Bearer smoke for debugging only. It does **not** match the browser auth
contract and will produce **401** against the real app. Do not use it to certify
hosted staging.

Before treating matrix failures as middleware bugs, verify:

```text
failed requests carried Supabase auth cookies (not Bearer-only)
cookie name/value format matches the app SSR client (`hcv-sb-auth`)
cookies were issued by the staging Supabase project
expiry / aud / iss match the staging project
```

Hosted CI path (job `auth-matrix` in `.github/workflows/hosted-staging-integration.yml`):

```text
workflow creates unique synthetic users + org fixtures at runtime
mints real Supabase session cookies
runs matrix with cookie-backed requests
always cleans up this run's fixtures/users
never stores JWTs or fixture UUIDs in GitHub secrets
AUTH_MATRIX_READY remains opt-in
```

Do **not** widen API auth to accept Bearer tokens solely to pass tests without an explicit product/security decision.

## Local environment variables

| Variable                          | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `AUTH_MATRIX_ENABLED`             | Set to `1` to run integration tests locally          |
| `AUTH_MATRIX_SUPABASE_URL`        | Staging/local Supabase URL                           |
| `AUTH_MATRIX_SUPABASE_ANON_KEY`   | Anon key for the staging project                     |
| `AUTH_MATRIX_SERVICE_ROLE_KEY`    | Service role for fixture bootstrap only              |
| `AUTH_MATRIX_BASE_URL`            | Running app base URL (e.g. `http://127.0.0.1:3000`)  |
| `PRODUCTION_SUPABASE_PROJECT_REF` | Production project ref used to fail closed on mix-up |
| `AUTH_MATRIX_RUNTIME_MANIFEST`    | Shared non-secret cleanup manifest path              |

Interim local-only Bearer tokens (not used by hosted CI):

| Variable                       | Purpose                  |
| ------------------------------ | ------------------------ |
| `AUTH_MATRIX_JWT_ORG_A_ADMIN`  | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_A_MEMBER` | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_ADMIN`  | Local smoke Bearer token |
| `AUTH_MATRIX_JWT_ORG_B_MEMBER` | Local smoke Bearer token |

Optional IDs after local seeding (Bearer smoke only):

| Variable                          | Purpose                         |
| --------------------------------- | ------------------------------- |
| `AUTH_MATRIX_ORG_A_INSTRUMENT_ID` | Same-org instrument for matrix  |
| `AUTH_MATRIX_ORG_B_INSTRUMENT_ID` | Cross-org instrument for matrix |

## Bootstrap (local Supabase)

Fixed local IDs in `seed-fixtures.ts` are for disposable local development only.
Hosted CI generates unique `AUTH_MATRIX_<run-id>` fixtures per run.

```bash
supabase start
supabase db reset --local --no-seed
npm run dev
npx tsx scripts/auth-matrix/seed-fixtures.ts
```

Mint sessions with Supabase Auth using `app_metadata.org_id` and `app_metadata.role`.

## Run cookie-backed matrix (local or hosted)

Requires a running app at `AUTH_MATRIX_BASE_URL`, `PRODUCTION_SUPABASE_PROJECT_REF`
(identifier, not a secret), and `AUTH_MATRIX_RUNTIME_MANIFEST` pointing at a
writable temp file. Passwords and cookies are minted at runtime and never printed.

```bash
AUTH_MATRIX_RUNTIME_MANIFEST=/tmp/hc-auth-matrix-runtime.json npm run auth-matrix:hosted
```

Hosted execution is staging-only. Production targets are denied.

## Run matrix (local interim Bearer harness)

NON-AUTHORITATIVE. Local debugging only.

```bash
AUTH_MATRIX_ENABLED=1 npm test -- --runInBand tests/integration/auth-matrix/matrix.test.ts
```

## Cleanup / reset

```bash
npx tsx scripts/auth-matrix/cleanup-fixtures.ts
./scripts/auth-matrix/reset-environment.sh
```

When `AUTH_MATRIX_RUNTIME_MANIFEST` is set, cleanup deletes only that run's
explicit IDs (idempotent, including "already gone"). It never scans unrelated
staging tenants by name.

`reset-environment.sh` runs `supabase db reset --local --no-seed` and re-applies all repository migrations.

## CI

Hosted CI auth-matrix job is **opt-in** via repository variable
`AUTH_MATRIX_READY=true`. Leave it unset/disabled until this harness has been
reviewed and hosted staging execution is separately authorized.

The cookie-backed entrypoint is `scripts/auth-matrix/run-hosted-matrix.ts`.
The job needs no JWT secrets: it mints sessions at runtime. Cleanup always
runs in the runner `finally` and again in the workflow `always()` step using
`${{ runner.temp }}/hc-auth-matrix-runtime.json`.

### How to activate later

1. Merge this harness (this is a post-RC change; do not mix into a frozen production RC without an explicit decision).
2. Confirm hosted staging secrets and `PRODUCTION_SUPABASE_PROJECT_REF` are configured.
3. Set repository variable `AUTH_MATRIX_READY=true`.
4. Dispatch `.github/workflows/hosted-staging-integration.yml`.
5. The auth-matrix job still runs only after `hosted-db-validation` succeeds.

Do **not** enable `AUTH_MATRIX_READY` from this implementation PR.
