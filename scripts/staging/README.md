# Hosted Staging Integration

Reusable guard and automation for **non-production** Supabase staging validation.

## Safety

- Production ref `dmilmlhquttcozxlpfxw` is unconditionally denied.
- Never commit secrets, JWTs, or connection strings.
- Run `npm run staging:guard` before migrations, fixtures, audits, Vault writes, or HTTP mutation tests.

## Required secrets (GitHub Environment `hosted-staging` / local)

| Variable | Purpose |
|----------|---------|
| `STAGING_SUPABASE_PROJECT_REF` | Allowlisted hosted staging project ref (primary) |
| `STAGING_PROJECT_REF` | Optional alias for the same ref (local/CI guard only) |
| `STAGING_SUPABASE_URL` | Staging Supabase HTTPS URL |
| `STAGING_SUPABASE_ANON_KEY` | Staging anon key |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging service role (fixture bootstrap only) |
| `STAGING_DATABASE_URL` | Staging Postgres connection string (pooler-compatible) |
| `STAGING_APP_BASE_URL` | Staging or localhost app base URL (non-production) |

Optional auth-matrix fixture secrets (see `scripts/auth-matrix/README.md`):

| Variable | Purpose |
|----------|---------|
| `AUTH_MATRIX_JWT_ORG_A_ADMIN` | Temporary smoke token (see cookie note below) |
| `AUTH_MATRIX_JWT_ORG_A_MEMBER` | Temporary smoke token |
| `AUTH_MATRIX_JWT_ORG_B_ADMIN` | Temporary smoke token |
| `AUTH_MATRIX_JWT_ORG_B_MEMBER` | Temporary smoke token |
| `AUTH_MATRIX_JWT_NO_ORG` | Missing-org identity token |
| `AUTH_MATRIX_ORG_A_INSTRUMENT_ID` | Same-org instrument fixture id |
| `AUTH_MATRIX_ORG_B_INSTRUMENT_ID` | Cross-org instrument fixture id |

## Commands

```bash
npm run staging:guard
npm run check:migrations
npm run staging:verify-migrations
npm run staging:audits
npm run test:staging-guard
```

## CI

Workflow: `.github/workflows/hosted-staging-integration.yml`

- Runs on `workflow_dispatch` when all required `STAGING_*` secrets are configured
- Serialized via concurrency group `hosted-staging-integration`
- Denies production ref/URL/DB unconditionally
- Runs migration inventory, hosted SQL audits, `/api/health`, and auth-matrix HTTP smoke checks

### Prerequisites (not in this PR)

| Gate | Depends on |
|------|------------|
| SQL audit step | PR #58 audit SQL files merged (or branch checked out at audited head) |
| `/api/health` 200 | Separate P0 PR `fix/hosted-health-catalog-checks-*` (direct DB catalog reads) |
| Auth matrix 16/16 | Cookie-backed session harness (app uses cookie SSR auth, not Bearer-only) |
| Workflow dispatch | Repo admin creates `hosted-staging` GitHub Environment + secrets |

## Auth matrix

See `scripts/auth-matrix/README.md` for synthetic fixture bootstrap, cleanup, and the cookie-session contract.
