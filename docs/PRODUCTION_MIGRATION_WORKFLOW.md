# Production Migration Deployment

Application CI and production database migration deployment are separate
workflows.

**This workflow has never been run.** Merging the PR that introduced or
corrected this file does not authorize a migration and does not run any
production workflow. Production `DATABASE_URL` is reported stale as of this
writing (see "Known operational blocker" below), and a resolved item
sometimes referred to elsewhere as "B7" remains unresolved — neither is
addressed by this document; both require separate, explicit, out-of-band
authorization before `production-db-deploy.yml` is ever dispatched.

## `.github/workflows/ci.yml` (and `code-quality.yml`, `security.yml`)

Runs automatically on every pull request and on every push to `main`/`develop`.
Installs dependencies, runs the migration-file guard (`npm run
check:migrations`, filenames/SQL patterns only — no database connection),
type-check, lint, Prettier, Jest (including the isolated-local-Postgres CLI
contract tests described below — a throwaway, in-process Postgres instance,
never a hosted or production database), the existing security/code-quality
scans, the application build, and the middleware manifest/routing guards.

This workflow does not read `DATABASE_URL` or any other production secret,
does not run `supabase db push`, and never contacts the production Postgres
database. Ordinary CI remains database-free with respect to the production
database — the local Postgres instance used by
`tests/integration/production/*.integration.test.ts` is created and
destroyed within the CI job itself and never leaves the runner. A green run
here is a build/test signal only — it says nothing about the state of the
production schema.

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
   - `confirmed_pending_migration_count` **and**
     `confirmed_pending_migration_digest` — both must match what the
     workflow computes at runtime from **exact version-set reconciliation**
     (not count arithmetic — see below), or the run stops. The count alone
     is not sufficient: two different pending sets can have the same size,
     which is exactly why the digest is also required.
   - `backup_pitr_confirmed` / `maintenance_window_approved` — must both be
     literally `yes`.
4. The production `Environment` must define a protected variable
   `EXPECTED_SUPABASE_PROJECT_REF` (see "Required Environment configuration"
   below); the run stops if it is unset.
5. `DATABASE_URL` is validated for **production identity**, not just
   structural validity (see "Endpoint identity enforcement" below), without
   ever being logged — only a bounded, non-reconstructable safe log line
   such as `endpoint=session-pooler port=5432 database=postgres
project_match=yes ssl=require` is printed.
6. A read-only connectivity probe (`SELECT 1`) runs before anything else
   touches the database.
7. Only after every gate above passes does the workflow run:
   ```
   supabase db push --db-url "$DATABASE_URL" --include-all --yes
   ```
8. Post-deploy, an **authoritative, blocking** direct-Postgres catalog
   postflight runs (see "Post-deploy verification" below), and `npm run
schema:ready` runs separately as a **non-authoritative diagnostic**. The
   deployment summary reports both results, plus whether `supabase db push`
   itself reported success — i.e. whether a production mutation already
   occurred — distinctly from either verification result.

`concurrency: { group: production-db-migration-deploy, cancel-in-progress:
false }` at the workflow level means at most one production migration run
executes at a time, and a second dispatch queues behind it rather than
canceling the one in progress.

### Exact version-set reconciliation (not count arithmetic)

Earlier versions of this workflow computed the pending-migration count as
`local .sql file count − applied count`. That formula cannot distinguish
"the sets are identical" from "the sets differ by the same number of
versions in each direction" (e.g. one remote-only version and one
local-missing version cancel out to a net difference of zero). It is
replaced with exact set reconciliation
(`scripts/production/db-deploy-guards.ts`):

- Local migration filenames are parsed with the repository's canonical
  contract (`^\d{14}_[a-z0-9_]+\.sql$`, the same pattern enforced by
  `scripts/check-active-migrations.js`). A `.sql` file that doesn't match is
  a hard failure, not a silent skip. Duplicate local versions are a hard
  failure.
- Remote `supabase_migrations.schema_migrations` versions are normalized and
  validated; a malformed or duplicated remote version is a hard failure.
- The workflow computes `pendingVersions = local − remote` and
  `remoteOnlyVersions = remote − local` as exact set differences and fails
  closed if `remoteOnlyVersions` is non-empty (a migration applied to
  production with no corresponding local file is always treated as
  ambiguous/unsafe, never silently ignored).
- `latestApplied` is informational metadata only — it is never used to
  decide readiness.
- A canonical SHA-256 **pending-set digest** is computed over the sorted
  pending versions, one per line, UTF-8, with a trailing newline after the
  last line (and the empty string, not a bare newline, when there are zero
  pending versions). Reordering the input never changes the digest; any
  actual change to the set always does.
- Logs and the operator-facing summary only ever show a **bounded**
  representation (count, first version, last version, digest) — never the
  complete pending-version list.

### Endpoint identity enforcement

`validateProductionEndpoint()` in `scripts/production/db-deploy-guards.ts`
does not merely check that `DATABASE_URL` is _a_ well-formed Postgres URL —
it checks that it is _the one approved production endpoint_:

| Requirement       | Accepted                                                                       | Rejected                                                                               |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Endpoint category | Supabase session pooler (`aws-<n>-<region>.pooler.supabase.com`)               | direct `db.<ref>.supabase.co` (IPv6-only direct connection), localhost, any other host |
| Username          | `postgres.<project_ref>`                                                       | any other form                                                                         |
| Project ref       | exactly equals the protected `EXPECTED_SUPABASE_PROJECT_REF` Environment value | any mismatch, including the staging project's ref                                      |
| Port              | `5432`                                                                         | `6543` (transaction pooler) or any other port                                          |
| Database          | `postgres`                                                                     | missing or any other name                                                              |
| SSL               | `sslmode=require` present                                                      | missing                                                                                |
| Credentials       | username and password present                                                  | either missing                                                                         |
| Raw value         | plain URL                                                                      | wrapped in quote characters or containing embedded `\n`/`\r` (corrupted-secret signal) |

Identity enforcement runs exactly once per deploy job, in the dedicated
`validate-only` step, before any step connects to the database. `probe`,
`history`, and the post-deploy catalog postflight reuse the same
already-gated `DATABASE_URL` and only re-check basic structural safety
(scheme, host present, credentials present, database name present) — not
full Supabase-specific identity again. This is what keeps those three modes
testable against any real Postgres, including the isolated local instance
started by `tests/integration/production/*.integration.test.ts`, without
faking a Supabase-shaped hostname in tests.

Nothing about the match — full project ref, full hostname, username,
password, URL, or query string — is ever logged. Only the bounded safe log
line is printed:

```
endpoint=session-pooler port=5432 database=postgres project_match=yes ssl=require
```

`describeDatabaseUrlSafely()` (used for structural-only diagnostics
elsewhere) returns a similarly non-reconstructable structured description —
coarse host _category_, port, database, and boolean flags only — never a
masked-but-reconstructable `postgres://***:***@host:port/db` string.

### Post-deploy verification: authoritative vs. diagnostic

`npm run schema:ready` (`src/app/api/_utils/schemaReadiness.ts`) reads
through PostgREST and has a documented false-negative mode: a PostgREST
permission error (HTTP 403 / Postgres error code `42501`) contains the
literal words "column"/"relation" in its message and is folded into
"missing column" by the existing error-classification heuristic instead of
being surfaced as a distinct, non-schema error. That means a green
`schema:ready` run is meaningful, but a _red_ one is ambiguous — it does not
reliably distinguish "the migration didn't converge" from "the credential
used for this check lacks a grant." It is therefore **not** the sole
blocking gate for "did the migration actually converge."

- `scripts/production/postflight-catalog.ts` reads Postgres system catalogs
  directly (`pg_proc`, `pg_trigger`, `information_schema.columns`,
  `supabase_migrations.schema_migrations`) inside a read-only transaction.
  It is **authoritative and blocking**: it fails the job if the final
  migration version set does not exactly equal the local set (pending count
  zero, remote-only count zero), or if any always-required function,
  trigger, or column is missing.
- `npm run schema:ready` still runs afterward as a **non-authoritative
  diagnostic** (`continue-on-error: true`); its result is reported in the
  summary but never blocks the job by itself. Fixing its 403/42501
  misclassification is out of scope for this change and tracked as a
  separate follow-up.
- The deployment summary distinguishes, as separate rows: the migration
  apply result, the catalog postflight result, the `schema:ready` result,
  and an explicit "production mutation occurred: yes/no" line driven by
  whether `supabase db push` itself reported success — so a reviewer never
  has to infer mutation state from an unrelated check's pass/fail.

### Supabase CLI version

Pinned to the exact version used for the completed migration rehearsal
(`supabase/setup-cli@v1`, `version: 2.111.0` in
`production-db-deploy.yml`) — the version that produced the successful
fresh×2, upgrade×2, and restart/resume rehearsal evidence. A workflow step
records `supabase --version` and checks (without invoking `db push`) that
`--db-url`, `--include-all`, and `--yes` are present in `supabase db push
--help` output, so a future CLI change that removes/renames a required flag
fails loudly during PR verification instead of silently during a real
deploy. Bump the pin only after rerunning the full rehearsal against the
new version; never claim equivalence without testing it.

### Secrets and required production Environment configuration

Only the `deploy` job (after environment approval) reads secrets, and only
in the specific steps that need each one:

- `DATABASE_URL` — the approved session-pooler connection string.
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` —
  used only by the non-authoritative `schema:ready` diagnostic step.

The production `Environment` must also define a **variable** (not
necessarily secret, but Environment-scoped and protected the same way as
the secrets above) `EXPECTED_SUPABASE_PROJECT_REF` holding the approved
production project reference. It is intentionally **not hard-coded in this
repository** — the workflow fails closed if it is unset. There is no
repository-level (non-Environment) fallback for any of these values; a
missing/invalid value fails the relevant step outright rather than falling
back to a default or a staging credential.

Configure on the `production` Environment (GitHub → Settings → Environments
→ production), all of which are operator/reviewer responsibilities outside
this PR's scope:

- **Required reviewers** on the Environment (protection rule) — this is what
  makes the "GitHub holds the job for approval" gate above actually hold.
- `DATABASE_URL` secret.
- `EXPECTED_SUPABASE_PROJECT_REF` variable.
- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  secrets (used only by the optional, non-authoritative readiness check).
- A documented backup/PITR operator process the operator attests to via
  `backup_pitr_confirmed` (this workflow does not itself take or verify a
  backup).
- A documented maintenance-window process the operator attests to via
  `maintenance_window_approved`.
- The reviewed pending-migration-set digest the operator must compute
  (e.g. via a dry-run `history` read against the production database, or by
  running `reconcileMigrationVersions` locally against a trusted read
  replica) and supply as `confirmed_pending_migration_digest`.

No workflow in this repository logs a database URL, password, project ref,
service-role key, or token in plaintext, and none of them fall back to
staging credentials if a production secret is missing.

### Known operational blocker

Production `DATABASE_URL` is reported stale as of this writing. Running
`production-db-deploy.yml` before that credential is repaired will fail at
the structural/identity-validation or connectivity-probe step by design
(fail-closed) rather than proceeding with a bad connection string. Repairing
that credential, configuring `EXPECTED_SUPABASE_PROJECT_REF`, and performing
the actual production deployment are out of scope for this change and
require separate, explicit authorization.
