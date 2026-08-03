# Production Migration Deployment

Application CI and production database migration deployment are separate
workflows.

## `.github/workflows/ci.yml` (and `code-quality.yml`, `security.yml`)

Runs automatically on every pull request and on every push to `main`/`develop`.
Installs dependencies, runs the migration-file guard (`npm run
check:migrations`, filenames/SQL patterns only — no database connection),
type-check, lint, Prettier, Jest, the existing security/code-quality scans,
the application build, and the middleware manifest/routing guards.

This workflow does not read `DATABASE_URL` or any other production secret,
does not run `supabase db push`, and never contacts the production Postgres
database. It cannot apply migrations or run schema-readiness checks against
production. A green run here is a build/test signal only — it says nothing
about the state of the production schema.

## `.github/workflows/production-db-deploy.yml`

Deploys pending migrations to production. `workflow_dispatch` only — it never
runs on push or pull_request, so opening or updating a PR (including PR #75)
never triggers it.

Gates, in order:

1. **`guard-ref` job** (no secrets, no environment): fails immediately unless
   `github.ref == 'refs/heads/main'`. A manual dispatch against any other
   branch or tag stops here before the `production` environment is even
   evaluated.
2. **`deploy` job** runs under the `production` GitHub Environment. GitHub
   holds the job — including secret injection — until an environment
   reviewer approves the run.
3. The operator must supply, as `workflow_dispatch` inputs:
   - `confirmed_sha` — the commit SHA they reviewed. The workflow checks out
     `main`, records the actual SHA, and stops if the two don't match
     exactly.
   - `confirmed_pending_migration_count` — the pending-migration count they
     reviewed. The workflow reads `supabase_migrations.schema_migrations`
     from the production database (before any mutation) and computes the
     actual pending count as `local .sql file count − applied count`. It
     stops if the reviewed and computed counts differ.
   - `backup_pitr_confirmed` / `maintenance_window_approved` — must both be
     literally `yes`.
4. `DATABASE_URL` is structurally validated (scheme, host, credentials
   present, database name present) without ever being logged — only a masked
   `postgres://***:***@host:port/db` form is printed.
5. A read-only connectivity probe (`SELECT 1`) runs before anything else
   touches the database.
6. Only after every gate above passes does the workflow run:
   ```
   supabase db push --db-url "$DATABASE_URL" --include-all --yes
   ```
7. Post-deploy, it re-reads migration history and fails the run if any
   migration is still pending, then runs the existing schema-readiness check
   (`npm run schema:ready`).

`concurrency: { group: production-db-migration-deploy, cancel-in-progress:
false }` at the workflow level means at most one production migration run
executes at a time, and a second dispatch queues behind it rather than
canceling the one in progress.

The Supabase CLI version is pinned to an exact release (see
`production-db-deploy.yml`) rather than `latest`, so a CLI upstream change
can't silently alter deploy behavior; bump it deliberately.

### Secrets

Only the `deploy` job (after environment approval) reads `DATABASE_URL`,
`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`,
and only in the specific steps that need each one. No workflow in this
repository logs a database URL, password, project ref, service-role key, or
token in plaintext, and none of them fall back to staging credentials if a
production secret is missing — a missing/invalid `DATABASE_URL` fails the
structural-validation step outright.

### Known operational blocker

Production `DATABASE_URL` is reported stale as of this writing. Running
`production-db-deploy.yml` before that credential is repaired will fail at
the structural-validation or connectivity-probe step by design (fail-closed)
rather than proceeding with a bad connection string. Repairing that
credential and performing the actual production deployment are out of scope
for this change and require separate, explicit authorization.
