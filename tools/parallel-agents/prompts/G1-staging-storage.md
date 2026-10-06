Define the S3 storage contract that real hosted-staging E2E runs will need, and
wire it into CI so a misconfigured run fails closed.

This is an ops/documentation task, not a test task. Unlike the sibling tasks in
this batch you may touch `.github/workflows/hosted-staging-integration.yml`.

## You must NOT create or change any real infrastructure

Hard boundary, no exceptions:

- Do **not** create, modify, or delete any AWS resource (no bucket, no IAM
  user, no role, no policy).
- Do **not** register, rotate, or read any GitHub secret.
- Do **not** run the AWS CLI, Supabase CLI, Vercel CLI, or `gh`.
- Do **not** put a real credential, bucket name, account id, or ARN into any
  file.

Everything that requires a human with cloud access must be left as an explicit,
clearly-marked `TODO(operator)` item. This task delivers **repo-side wiring,
documentation, and validation only**.

## Deliverables

1. **Documentation** — a new file under `docs/e2e-staging-storage*` covering:
   - the bucket contract: purpose, naming convention, region, lifecycle/expiry
     for test objects, and whether it is shared or per-branch
   - the least-privilege IAM scope: the minimum actions required
     (e.g. `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and
     `s3:ListBucket` only if genuinely needed) restricted to one key prefix
   - why the staging credential must not be reusable against production
   - cleanup expectations: who deletes test objects, when, and what happens to
     orphans
   - a `TODO(operator)` checklist of every action needing cloud access

2. **Required env names** — define the exact env var names the E2E run expects
   and add them, with placeholder values and comments, to `env.template`.
   Follow the naming already used in that file. Document which are secrets
   (GitHub secrets) and which are plain config.

3. **Fail-closed CI wiring** — in
   `.github/workflows/hosted-staging-integration.yml`, add a preflight step
   that asserts every required storage env var is present and non-empty, and
   fails the job with an actionable message when one is missing. Study the
   existing "Require E2E test environment" / allowlist-style guard steps in
   `.github/workflows/ci.yml` and mirror that style — but **`ci.yml` itself is
   frozen for this task; read it, do not edit it.**

   The wiring must fail closed: absent or empty configuration fails the job. It
   must never default to a bucket name, skip the storage step silently, or fall
   back to production credentials.

4. **Validation** — if a guard script fits the repo's existing pattern (see
   `scripts/staging/`), add one with a clear non-zero exit on missing config.
   Keep it dependency-free and offline. It must not call any cloud API.

## Out of scope

- Any change to `.github/workflows/ci.yml`, including its concurrency settings.
  Hosted-staging serialization is deliberately a separate PR.
- Changing the E2E specs themselves.
- Enabling the storage feature anywhere by default. Default stays off/absent.

## Hard constraints

- Keep `npm run type-check` and `npm run lint` clean.
- Validate any YAML you edit for syntax before finishing.
- State plainly in your report that no AWS resource was created and no secret
  was registered.
