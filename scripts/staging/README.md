# Hosted Staging Integration

Reusable guard and automation for **non-production** Supabase staging validation.

## Safety

- Production project ref is an **identifier** (not a credential). It must be
  supplied as GitHub Actions variable / env `PRODUCTION_SUPABASE_PROJECT_REF`.
- The staging guard fails closed when that variable is missing, empty, malformed,
  equal to the staging ref, or present inside staging URLs.
- Never hard-code a production project ref in source or workflow shell scripts.
- Never commit secrets, JWTs, or connection strings.
- Run `npm run staging:guard` before migrations, fixtures, audits, Vault writes, or HTTP mutation tests.

## GitHub workflow jobs

Workflow: `.github/workflows/hosted-staging-integration.yml`

| Job                    | Trigger                                                | Secrets              | Purpose                                                              |
| ---------------------- | ------------------------------------------------------ | -------------------- | -------------------------------------------------------------------- |
| `static-validation`    | `pull_request` + `workflow_dispatch`                   | none                 | Guard unit tests, migration inventory lint, shell script syntax      |
| `hosted-db-validation` | `workflow_dispatch` only                               | 6× `STAGING_*` below | Guard CLI, migration set, SQL audits, `/api/health`                  |
| `auth-matrix`          | `workflow_dispatch` when `vars.AUTH_MATRIX_READY=true` | same 6× `STAGING_*`  | Runtime fixture bootstrap + cookie-backed matrix (follow-up harness) |

### Required GitHub variable (identifier, not a secret)

| Variable                          | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | Production Supabase project ref used to fail closed on staging/prod mix |

Register **only these six** secrets on the `hosted-staging` GitHub Environment:

| Variable                            | Purpose                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `STAGING_SUPABASE_PROJECT_REF`      | Allowlisted hosted staging project ref (primary)                           |
| `STAGING_PROJECT_REF`               | Optional alias for the same ref (local/CI guard only; not a GitHub secret) |
| `STAGING_SUPABASE_URL`              | Staging Supabase HTTPS URL                                                 |
| `STAGING_SUPABASE_ANON_KEY`         | Staging anon key                                                           |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging service role (fixture bootstrap only)                              |
| `STAGING_DATABASE_URL`              | Staging Postgres connection string (pooler-compatible)                     |
| `STAGING_APP_BASE_URL`              | Staging or localhost app base URL (non-production)                         |

Do **not** store expiring JWTs or synthetic fixture UUIDs as GitHub secrets. The auth-matrix job will mint sessions and seed fixtures at workflow runtime once the cookie-backed harness lands.

Enable the auth-matrix job only after merging `scripts/auth-matrix/run-hosted-matrix.ts` by setting repository variable:

```text
AUTH_MATRIX_READY=true
```

## Local commands

```bash
export PRODUCTION_SUPABASE_PROJECT_REF=<production-project-ref>
npm run staging:guard
npm run check:migrations
npm run staging:verify-migrations
npm run staging:audits
npm run test:staging-guard
```

## Prerequisites (outside this scaffold)

| Gate               | Depends on                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| SQL audit step     | PR #58 audit SQL files merged (or branch checked out at audited head)                                    |
| `/api/health` 200  | Separate P0 PR `fix/hosted-health-catalog-checks-*` (direct DB catalog reads)                            |
| Auth matrix job    | Cookie-backed harness + `vars.AUTH_MATRIX_READY=true`                                                    |
| Hosted DB dispatch | Repo admin creates `hosted-staging` Environment + 6 secrets + `PRODUCTION_SUPABASE_PROJECT_REF` variable |

## Auth matrix

See `scripts/auth-matrix/README.md` for the cookie-session contract and local bootstrap.
