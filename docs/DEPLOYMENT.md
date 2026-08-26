# Production deployment guide

This document is the operator-facing launch guide. Detailed production
migration mechanics live in
[PRODUCTION_MIGRATION_WORKFLOW.md](./PRODUCTION_MIGRATION_WORKFLOW.md).

If this file conflicts with `package.json`, `vercel.json`,
`.github/workflows/*`, `env.template`, or `npm run check:env`, those sources
win. Do not bypass the guarded production migration workflow to preserve
older tutorial steps.

A local `npm run lint && npm test && npm run build` loop is a **repository
release check**. It is not a production-release certification: hosted DB,
staging synthetics, restore drills, and Preview health are separate.

---

## How the launch path is split

| Phase                             | What it is                                   | Mutates production DB? |
| --------------------------------- | -------------------------------------------- | ---------------------- |
| 1. Repository CI / release checks | `ci.yml`, `security.yml`, `code-quality.yml` | No                     |
| 2. Hosted staging rehearsal       | `hosted-staging-integration.yml`             | No (staging only)      |
| 3. Production database migration  | `production-db-deploy.yml`                   | Yes, only after gates  |
| 4. Vercel application deployment  | Platform Git / dashboard integration         | No                     |
| 5. Post-deploy validation         | `/api/health`, `/api/ready`, smoke           | No                     |
| 6. Optional operational hardening | monitoring, domain, SEO, analytics           | No                     |

Merging to `main` does **not** apply production migrations. Application CI
does **not** run `supabase db push` and does not read production
`DATABASE_URL`.

Preferred order:

```text
hosted staging validation / rehearsal
  → production DB preflight / review
  → production DB migration (guarded workflow)
  → authoritative DB postflight
  → production application deploy / build
  → health / readiness / smoke validation
```

---

## Current operational prerequisites

These statements remain true unless a later, recorded operator run proves
otherwise. Workflow source existing, local/disposable Postgres tests, a
staging workflow definition, and green PR CI are **not** production DB proof.

- `production-db-deploy.yml` has never been run.
- Production `DATABASE_URL` remains documented as operationally stale.
  Dispatching the deploy workflow before that credential is repaired is
  expected to fail closed at identity validation or the connectivity probe.
- Production restore / PITR drill is `PRODUCTION_RESTORE_DRILL_NOT_PROVEN`.
  A local `pg_dump` / restore is not equivalent.
- Vercel Preview: existing failure remains unresolved
  (`VERCEL_PREVIEW_UNRESOLVED`). Changing `installCommand` to `npm ci` is a
  deterministic-install fix only; it is not a Preview repair. Repository CI
  success is not Preview success.
- Hosted staging inspect/apply **contract** exists. That is not
  `HOSTED_EVIDENCE_COMPLETE` until a non-production hosted apply with
  pending count > 0 actually succeeds. Staging secrets remaining unavailable
  means hosted apply has not been proven.
- Hosted post-deploy synthetic has not completed because required staging
  environment configuration was unavailable.

Do not treat a green Security Scan job as “Snyk passed” when Snyk was skipped.

---

## Release gate matrix

This is the current **repository-owned** release contract. Advisory checks
are not release blockers. Hosted staging/production proof that has not run
is not claimed here.

### AUTOMATED / REQUIRED

GitHub PR CI (`.github/workflows/ci.yml`, `code-quality.yml`,
`security.yml`) plus the repo-controlled Vercel install/build contract:

- `npm ci` (GitHub CI jobs and `vercel.json` `installCommand`)
- migration file guard (`npm run check:migrations`)
- zero-warning lint (`npm run lint` → `eslint . --max-warnings=0`)
- type-check (`npm run type-check`)
- Jest tests (`npm run test -- --ci --coverage` in CI)
- `next build` (CI `Build` job uses `npm run build`; Vercel production
  deploy uses `npm run deploy:build`)
- middleware manifest/routing verification
- production-build Chromium critical E2E (`npm run test:e2e:critical`)
- production dependency high-severity audit:
  `npm audit --omit=dev --audit-level=high` (blocking; no `continue-on-error`)
- production environment validator in `deploy:build`:
  `check:env` → `schema:ready` → `build`

Node 20.x and `packageManager` `npm@11.7.0` remain the install toolchain.

### ADVISORY / SUPPLEMENTAL

These run in `security.yml` and are classified in the Actions job summary.
They must not be described as PASS when they skipped or only found advisory
issues.

| Check                               | Policy       | Visible results                                                       |
| ----------------------------------- | ------------ | --------------------------------------------------------------------- |
| Full `npm audit --audit-level=high` | advisory     | `PASS` / `ADVISORY_FINDINGS` / `TOOL_ERROR`                           |
| Snyk (`SNYK_TOKEN` optional)        | supplemental | `PASS` / `FINDINGS_OR_TOOL_ERROR` / `SKIPPED_NO_TOKEN` / `TOOL_ERROR` |

A missing `SNYK_TOKEN` is `SKIPPED_NO_TOKEN`. That is not a successful Snyk
scan. Ordinary PR CI does not require a paid Snyk account. A Snyk GitHub
step `failure` is `FINDINGS_OR_TOOL_ERROR`: `snyk/actions/node` does not
expose the CLI exit code, so vulnerability findings (exit 1) cannot be
separated from scan/tool failure (exit 2 or 3).

SonarCloud in `code-quality.yml` remains `continue-on-error` and is not a
release blocker.

### OPERATIONAL / REQUIRES ENVIRONMENT

These require live credentials, GitHub Environments, and operator action.
They are **OPERATIONAL / NOT YET PROVEN** until actually executed and
recorded (see [Current operational prerequisites](#current-operational-prerequisites)):

- hosted staging migration rehearsal (`inspect` / `apply`)
- hosted post-deploy synthetic
- production DB migration (`production-db-deploy.yml`)
- production backup / PITR (operator process; not performed by the workflow)
- Vercel deployment health (Preview and Production)

---

## A. Repository gates

Expected mostly complete on a green PR against `main`.

Local reproduction of repository checks (does not certify production):

```bash
npm ci
npm run check:migrations
npm run lint
npm run type-check
npm run test -- --ci --coverage
npm run build
```

Critical Playwright E2E is blocking in GitHub CI
(`npm run test:e2e:critical`). Jest is blocking in CI. Exact historical
test counts are not documented here; they drift.

CI install uses `npm ci`. Do not treat `npm install` as the CI or Vercel
install command.

---

## B. Hosted staging

Authoritative sources:
`.github/workflows/hosted-staging-integration.yml` and
[scripts/staging/README.md](../scripts/staging/README.md).

`workflow_dispatch` only for hosted DB work. The workflow uses the
`hosted-staging` GitHub Environment. It never uses the `production`
Environment and never reads production `DATABASE_URL`.

### Modes

| Mode      | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off`     | Existing validation path for an already-converged staging database: staging guard, exact migration-set verification, SQL audits, `/api/health`, `/api/ready`, optional synthetic. Not a migration mutation rehearsal. No `supabase db push`.                                                                                                                                                                                |
| `inspect` | Read-only. Computes current pending migration state (SHA, pending count, pending-set digest). No `db push`. Use the outputs as reviewed inputs for apply.                                                                                                                                                                                                                                                                   |
| `apply`   | Only after inspect/review. Recomputes state at runtime. Requires exact matching SHA, pending count, and pending digest, plus `staging_mutation_confirmed=yes`. Uses `STAGING_DATABASE_URL` only. Runs the same pinned migration engine as production (`supabase/setup-cli` `2.111.0`, `supabase db push --db-url "$STAGING_DATABASE_URL" --include-all --yes`). Performs authoritative catalog postflight after a mutation. |

Operator flow: inspect first, review SHA / pending count / digest, then
apply with those exact values. Do not one-click mutate.

Zero pending migrations is `NO_PENDING_MIGRATIONS` and is not a completed
mutation rehearsal. Do not claim `HOSTED_EVIDENCE_COMPLETE` from `mode=off`
or from inspect-only.

### Hosted staging checklist

- [ ] `hosted-staging` Environment vars/secrets configured (see staging README)
- [ ] `inspect` when pending state is unknown
- [ ] `apply` only if pending count > 0 and reviewed inputs match
- [ ] catalog postflight on apply
- [ ] migration-set equality (`mode=off` or post-apply)
- [ ] SQL audits (`mode=off` and post-apply)
- [ ] `GET /api/health`
- [ ] `GET /api/ready`
- [ ] synthetic (`npm run test:synthetic:postdeploy`) when credentials exist

---

## C. Production platform configuration

### Environment contract

Authoritative production contract: `env.template` and `npm run check:env`
(invoked by `npm run deploy:build`). Do not treat any hand-written list as
a substitute for that validator. Do not invent extra required keys.

Production **required** names (see `src/config/env/keys.ts` /
`env.template`):

- Supabase (public): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Application URL: `NEXT_PUBLIC_APP_URL` (https, not localhost)
- Supabase (server): `SUPABASE_SERVICE_ROLE_KEY`
- Object storage: `STORAGE_TYPE=s3`, `S3_BUCKET_NAME`, `S3_REGION`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Upstash Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Server-only: `ORPHAN_CLEANUP_SECRET`

Optional / not launch-blocking for the app validator:

- `DATABASE_URL` is optional for `check:env`. It is **required** for
  production DB workflows, on the GitHub `production` Environment, not as
  a Vercel build secret unless you choose to set it there.
- Sentry, analytics, and custom branding keys are optional.
- `RESEND_API_KEY` and `SEND_NOTIFICATIONS_SECRET` are **not** production
  requirements. Email notification delivery is unsupported in this release.

If `SUPABASE_URL` / `SUPABASE_ANON_KEY` are set, they must match the
corresponding `NEXT_PUBLIC_*` values.

Service role keys must never be exposed to the client (`NEXT_PUBLIC_`
prefix is forbidden for secrets).

Set Production / Preview / Development values in the Vercel project env
UI. Use placeholders only in git. Preview should use non-production data
stores when possible; do not copy a stale production `DATABASE_URL` into
Preview.

### Storage

Instrument images and certificates are stored in durable object storage
(S3 or compatible). Production and Preview require `STORAGE_TYPE=s3`.
`STORAGE_TYPE=local` is development/test only.

Do not configure public Supabase `instrument-images` buckets for those
assets. Supabase Storage remains invoice images (`invoices` bucket) only,
managed by versioned migrations. Do not reopen public `instrument-images`
policies.

Optional storage keys (`AWS_ENDPOINT_URL`, `S3_ADDRESSING_STYLE`,
`KMS_KEY_ID`, `UPLOAD_MAX_FILE_SIZE_MB`) are documented in `env.template`.

Boot-time instrumentation refuses to start outside `development`/`test`
without S3 configuration.

### GitHub `production` Environment (operator UI — unverified here)

None of these can be created from repository code. Leave unchecked until
an operator confirms them in GitHub:

- [ ] Required reviewer on the `production` Environment
- [ ] Deployment branch restricted to `main`
- [ ] Environment-scoped `DATABASE_URL` (fresh, valid session-pooler URL)
- [ ] `EXPECTED_SUPABASE_PROJECT_REF` configured
- [ ] `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` /
      `SUPABASE_SERVICE_ROLE_KEY` for the diagnostic `schema:ready` step
- [ ] Deployment history retention left enabled

### `main` branch protection (operator UI — unverified here)

GitHub → Settings → Branches or Rulesets, targeting `main`:

- [ ] Require a pull request before merging
- [ ] Require status checks to pass (verify live names on a PR; commonly
      `Test & Lint`, `Build`, `E2E Tests`, `Security Scan`,
      `Code Quality Check`)
- [ ] Require conversation resolution before merging
- [ ] Do not allow force pushes
- [ ] Do not allow deletion of `main`

This repository’s workflows do not themselves enable those rules.

---

## D. Production DB release

**Authoritative path:**
`.github/workflows/production-db-deploy.yml`
(`workflow_dispatch` only, `main` only, `production` Environment).

Details, identity rules, digest format, and conditional audits:
[PRODUCTION_MIGRATION_WORKFLOW.md](./PRODUCTION_MIGRATION_WORKFLOW.md).

Read-only companion (never mutates, never runs `supabase db push`):
`.github/workflows/production-db-reconcile.yml`.

### Operator sequence

1. Production GitHub Environment configuration exists (reviewers, branch
   restriction, secrets/variables).
2. Fresh, valid production `DATABASE_URL` (session pooler identity; see
   the workflow document). Stale credentials will fail closed.
3. `EXPECTED_SUPABASE_PROJECT_REF` is configured on that Environment.
4. Backup / PITR status is reviewed in Supabase (operator process).
5. An approved maintenance / change window exists.
6. Read-only production migration history / reconciliation
   (`production-db-reconcile.yml` or an equivalent read-only history
   probe). Do **not** use `production-db-deploy.yml` as a dry run.
7. Review and record:
   - checked-out SHA on `main`
   - pending migration count
   - pending-set digest
8. Dispatch `production-db-deploy.yml` with those reviewed values.
9. The workflow guard verifies:
   - `refs/heads/main`
   - SHA match
   - pending count match
   - pending digest match
   - `backup_pitr_confirmed=yes`
   - `maintenance_window_approved=yes`
   - production endpoint identity
10. Conditional read-only migration-specific predeploy audits (only when
    those versions are pending).
11. Pinned Supabase CLI (`2.111.0`) runs:
    `supabase db push --db-url "$DATABASE_URL" --include-all --yes`
12. Authoritative catalog postflight (blocking).
13. Diagnostic `npm run schema:ready` (non-authoritative; does not solely
    decide convergence).
14. Review the Actions job summary (apply vs postflight vs diagnostic vs
    whether a production mutation occurred).

`backup_pitr_confirmed=yes` is an **operator acknowledgement**. The
workflow does not create or verify a recovery point.

### Do not use for normal production rollout

These must not be presented as supported production deployment paths:

- Supabase SQL Editor as the production migrator
- `scripts/supabase/apply-migrations.sh`
- Hand-ordered individual files (`database-schema.sql`,
  `migration-add-subtype.sql`, `migration-maintenance-tasks.sql`, or any
  cherry-picked `supabase/migrations/*.sql`)
- Root-level `migration-*.sql` procedures
- `npm run migrate:*` helpers
- Merging to `main` as an implied auto-apply

Manual SQL Editor execution is not the normal production migration path.
Do not manually cherry-pick individual migration files into production.
Do not use legacy migration helper scripts for normal production
rollout. Production migration state must be reconciled through the
guarded workflow.

Those scripts may still exist for development, recovery, or history.
They are **not authoritative** for normal production deployment.

[docs/migrations/README.md](./migrations/README.md) is a local/schema
reference. It is not the production deploy runbook.

---

## E. Application launch

### What this repository proves about Vercel

`vercel.json`:

- Install command: `npm ci`
- Build command: `npm run deploy:build`
- Production deploy build contract: `check:env` → `schema:ready` → `build`
- Output directory: `.next`
- Dev command: `npm run dev`

GitHub Actions CI (`ci.yml`) validates the application. It is **not** a
Vercel deploy workflow. There is no repository workflow that runs
`vercel --prod` or uses `VERCEL_TOKEN` to promote production.

If Vercel deploys on git events, that trigger is **platform-side Git
integration** (Vercel project settings), not something this repository’s
Actions files guarantee. Do not document “`main` push automatically
deploys to Vercel” as a repository-owned fact.

Optional CLI deploy (`vercel --prod`) is a dashboard/CLI operator action,
not CI.

Preview remains `VERCEL_PREVIEW_UNRESOLVED`. Do not treat Preview as
fixed by `npm ci`.

### After a production application deployment

| Endpoint / command                  | Meaning                                                                                                                   | Expected consumer                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/health`                   | Process liveness only. HTTP 200 while the process can serve HTTP. Does not probe DB, schema, or third-party integrations. | Cheap uptime pings                                                                |
| `GET /api/ready`                    | Runtime configuration + database reachability + schema compatibility. HTTP 200 only when ready; otherwise HTTP 503.       | Release validation                                                                |
| `npm run wait:ready`                | Bounded poll of `/api/ready`                                                                                              | Post-deploy CI                                                                    |
| `npm run test:synthetic:postdeploy` | Cookie-authenticated staging client create/read/delete                                                                    | Staging only; see [scripts/postdeploy/README.md](../scripts/postdeploy/README.md) |

Do not treat liveness 200 as release-ready.

Production smoke (operator):

- [ ] Login
- [ ] Admin vs member behavior
- [ ] Critical CRUD / business workflows
- [ ] Upload / storage (S3) smoke

---

## F. Operational follow-up

Optional relative to DB migration safety. Do not treat SEO or analytics
as equivalent to a guarded production migration.

- [ ] Runtime / platform log access
- [ ] Error monitoring (Sentry or equivalent) — optional credentials; not
      a `check:env` requirement
- [ ] External uptime monitoring and alerting
- [ ] Restore drill (`PRODUCTION_RESTORE_DRILL_NOT_PROVEN` until done)
- [ ] Custom domain
- [ ] Analytics
- [ ] Accessibility / SEO as appropriate

---

## Notification delivery status

Email notification delivery is not supported in the current release.

- Notification settings cannot enable email delivery. `GET /api/notification-settings` reports `notificationDeliverySupported: false` and effective `email_notifications` / `enabled` values of `false`. `POST` requests that try to enable delivery return HTTP 409 (`NOTIFICATION_DELIVERY_UNSUPPORTED`).
- Resend and the `send-notifications` Edge Function are not a production dependency. Do not deploy that function, configure pg_cron for it, or require `RESEND_API_KEY` / `SEND_NOTIFICATIONS_SECRET` for launch.
- Enabling email delivery requires a separate production-readiness project. There is no promised release date.

---

## Security notes (concise)

### HTTP headers and CSP

`next.config.ts` emits security headers, including
`Content-Security-Policy`. `vercel.json` also sets frame/content-type/
referrer/permissions headers (not a substitute for the Next CSP).

CSP is present. The current policy still permits inline script/style
behavior required by the application (`script-src 'self' 'unsafe-inline'`,
`style-src 'self' 'unsafe-inline'`). This is not a strict nonce/hash CSP.
Stricter nonce/hash hardening remains a separate improvement.

### Database authorization

Do not describe RLS as “authenticated users can perform all operations.”

Current schema uses organization scoping, admin/member distinctions, and
DB-level financial confidentiality (RLS and RPC-based authorization). See
versioned migrations under `supabase/migrations/` and, for the financial
boundary, `tests/integration/migrations/enforce_financial_confidentiality_db_boundary.integration.test.ts`.
This guide does not restate the full security architecture.

---

## Rate limiting

Application rate limiting is **not** a substitute for CDN/WAF controls.

Production backend: Upstash Redis (`UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`). Missing production Upstash config fails
closed unless an operator sets the emergency override documented in
`env.template`. `RATE_LIMITING_DISABLED=true` is not an ordinary
production setting.

---

## Monitoring

### Required for first safe launch

- Access to runtime / platform logs (Vercel, GitHub Actions)
- Health / readiness visibility (`/api/health`, `/api/ready`)
- Database backup state understood (operator; not automated by
  `backup_pitr_confirmed`)

### Recommended

- Sentry or equivalent
- External uptime monitoring
- Alerting
- Analytics

Do not make optional third-party monitoring credentials look like build
requirements.

---

## Rollback

Application: use the Vercel dashboard (or CLI) to promote a previous
deployment. This repository does not define a GitHub Actions rollback job.

Database: restore from Supabase backup / PITR. There is no in-repo
automated production DB rollback. `PRODUCTION_RESTORE_DRILL_NOT_PROVEN`.

---

## Related documents

- [Production migration workflow](./PRODUCTION_MIGRATION_WORKFLOW.md)
- [Hosted staging](../scripts/staging/README.md)
- [Post-deploy synthetic](../scripts/postdeploy/README.md)
- [Local migration reference](./migrations/README.md) (not production)
- [env.template](../env.template)
- [Project README](../README.md)
