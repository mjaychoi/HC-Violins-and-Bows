# Post-deploy synthetic validation

Staging/preview deployment check. This is not a browser E2E suite.

| Endpoint/command                    | Meaning                                          | Expected consumer                     |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `GET /api/health`                   | Process liveness                                 | Container/platform supervision        |
| `GET /api/ready`                    | Runtime configuration + DB + schema readiness    | Deployment traffic/release validation |
| `npm run wait:ready`                | Bounded poll until `/api/ready` is ready         | Post-deploy CI hook                   |
| `npm run test:synthetic:postdeploy` | Authenticated client CRUD against a deployed URL | Staging/post-deploy release check     |

## Safety

- Staging-only. The target Supabase project ref must match `STAGING_SUPABASE_PROJECT_REF`.
- The configured production ref (`PRODUCTION_SUPABASE_PROJECT_REF`) is refused.
- Known production app host patterns are refused.
- Production writes are not implemented. `POSTDEPLOY_ALLOW_PRODUCTION=true` fails closed.
- If `STAGING_APP_BASE_URL` is set, `POSTDEPLOY_BASE_URL` must share that origin.

## Required environment variable names

Do not put secret values in git, tickets, or logs.

- `POSTDEPLOY_BASE_URL` (or `STAGING_APP_BASE_URL`)
- `STAGING_SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_PROJECT_REF`
- `STAGING_SUPABASE_URL` (fallback: `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`)
- `STAGING_SUPABASE_ANON_KEY` (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`)
- `SYNTHETIC_EMAIL` (fallback: `E2E_TEST_EMAIL`)
- `SYNTHETIC_PASSWORD` (fallback: `E2E_TEST_PASSWORD`)

Optional wait bounds:

- `POSTDEPLOY_READY_TIMEOUT_MS` (default 120000)
- `POSTDEPLOY_READY_INTERVAL_MS` (default 2000)
- `POSTDEPLOY_REQUEST_TIMEOUT_MS` (default 5000 for wait, 15000 for synthetic)

## Workflow

1. `GET /api/ready` must return HTTP 200 and `{ "status": "ready" }`.
2. Sign in through normal Supabase password auth and send the app session cookie. Service-role is not used for the workflow.
3. Authenticated `GET /api/clients?pageSize=1`.
4. Create a uniquely marked client (`synthetic-<id>`).
5. Read that client back and confirm the marker.
6. Delete the client. Cleanup failure is a command failure and prints the non-secret client id for operator cleanup.

## Exit codes

- `0`: every required step passed, including cleanup
- non-zero: allowlist, credentials, readiness, auth, read, create, read-after-write, cleanup, or timeout failed

The command prints a step summary and never prints passwords, JWTs, cookies, or Authorization headers.

## What this does not validate

Browser UI, invoices/sales/instruments, production traffic, and Vercel Git production promotion. Git-integrated Vercel deploys are not blocked by this script unless a workflow that runs it is required.
