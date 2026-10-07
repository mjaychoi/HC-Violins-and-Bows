# Staging storage E2E: operator handoff

Status: **repository wiring ready, operator action required.** Until an
operator provisions the AWS resources and GitHub settings below, the hosted
`E2E Tests` job keeps running with the inert `e2e-ci-placeholder` bucket and
no storage credentials, exactly as before. Storage-dependent E2E (instrument
image / certificate upload, replace, delete) cannot run until then.

Nothing in this repository creates or changes AWS resources. Every AWS step
below is a manual operator action.

## Scope

| Asset                                                                 | Backend                                                                | E2E isolation                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Instrument images (`/api/instruments/[id]/images`)                    | S3 (`getStorage()`)                                                    | this contract: `e2e/<scopeKey>/` in a staging-only bucket                                                          |
| Instrument certificates (`/api/instruments/[id]/certificates`)        | S3 (`getStorage()`)                                                    | this contract                                                                                                      |
| Instrument delete storage cleanup, `orphaned_storage_objects` retries | S3 (`getStorage()`)                                                    | this contract                                                                                                      |
| Invoice images (`/api/invoices/images`)                               | Supabase Storage `invoices` bucket of the **staging** Supabase project | already project-separated; keys are `<orgId>/...` and the org is run-scoped. Not covered here (see "Not covered"). |

## Object key contract

- Run scope: CI sets `E2E_RUN_SCOPE=<run_id>-<run_attempt>-critical`;
  `tests/e2e/e2e-identities.ts` hashes it to a 12-hex `scopeKey`.
- Every object a storage E2E run writes lives under exactly
  **`e2e/<scopeKey>/`**, e.g.
  `e2e/0a1b2c3d4e5f/<orgId>/<instrumentId>/<timestamp>-<uuid>-<name>.png`.
  The `<orgId>/<instrumentId>/...` tail is the unchanged production layout.
- Enforcement is in the app (`src/utils/storage/e2eKeyPrefix.ts`, used by
  `S3Storage`), driven by `STORAGE_E2E_KEY_PREFIX=e2e/<scopeKey>`:
  - writes are prefixed and the prefixed key is what routes persist
    (`instrument_images.storage_key`, `instrument_certificates.storage_path`);
  - reads, deletes, HEAD, and presigns of any key outside `e2e/<scopeKey>/`
    are refused;
  - the value must be exactly `e2e/<12 lowercase hex>`, requires
    `STORAGE_TYPE=s3`, and is refused on `VERCEL_ENV=production`.
    `check:env` / `deploy:build` reject it for every Vercel deployment.
  - When it is unset (every deployment), keys and behavior are unchanged.
- Never a shared, unscoped key. The IAM policy below also denies (by not
  allowing) any key outside `e2e/`.

## Staging-only guard (`tests/e2e/staging-storage.ts`)

Runs in the `Configure staging storage E2E (fail-closed)` CI step and again in
the cleanup step. Modes:

| `E2E_STAGING_STORAGE_ENABLED` | Storage inputs        | Result                                                                         |
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| unset / empty                 | none                  | **disabled**: placeholder bucket, no credentials, no prefix (today's behavior) |
| unset / empty                 | some or all           | **fail** (partial configuration)                                               |
| `false`                       | any                   | **disabled** (explicit pause, logged)                                          |
| `true`                        | all valid             | **enabled**                                                                    |
| `true`                        | any missing / invalid | **fail**                                                                       |
| anything else                 | any                   | **fail**                                                                       |

When enabled, every check must pass or the job fails before the app builds:

- Supabase URL ref equals `STAGING_SUPABASE_PROJECT_REF` and is not
  `PRODUCTION_SUPABASE_PROJECT_REF` (reuses
  `scripts/assert-e2e-staging-project-allowlist.ts`).
- `PRODUCTION_S3_BUCKET_NAME` is set (deny target).
- Bucket name: valid S3 name; contains a `staging` name token (`-staging-`,
  `staging-`, `.staging.` …); has no `prod` / `production` token; is not the
  placeholder, not `PRODUCTION_S3_BUCKET_NAME`, and not the known production
  bucket `hc-bows`.
- Region is a valid AWS region; access key id is a long-term IAM user key
  (`AKIA…`); secret is well-formed; `AWS_ENDPOINT_URL` / `AWS_SESSION_TOKEN`
  are unset; `STORAGE_TYPE=s3`; `E2E_RUN_SCOPE` yields a valid scope key.
- A second step (`--verify`) proves the env later steps actually see matches
  the validated config (and, when disabled, that the placeholder is intact
  and no app credentials or prefix are present).

The legacy repository secrets `S3_BUCKET_NAME`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `STORAGE_TYPE` (provenance
unconfirmed; treat as production) must never be mapped into the E2E job.

## Cleanup contract

- `tests/e2e/cleanup-staging-storage-e2e.ts`, CI step
  `Clean up run-scoped staging storage objects (safety net)`, runs
  `if: always()` whenever the configure step resolved `enabled`.
- Re-validates the full guard, refuses if the app env differs from it, then
  lists **only** `Prefix=e2e/<scopeKey>/`, refuses to act if the listing ever
  returns a key outside that prefix, deletes in batches of ≤ 1000, fails on
  any per-object delete error, and re-lists to prove `residualTotal: 0`.
- Idempotent: an empty namespace is a verified no-op. Refuses an empty or
  malformed scope key. Never deletes by age, pattern, or the bare `e2e/`
  prefix, so it cannot touch another concurrent run's objects.
- Backstop: the bucket lifecycle rule expires everything under `e2e/` after
  1 day (and aborts incomplete multipart uploads), covering runs that crash
  before cleanup.
- Database rows (`instrument_images`, `instrument_certificates`,
  `orphaned_storage_objects`) cascade with the run-scoped org at teardown
  (`tests/e2e/run-scoped-fixtures.ts`); this cleanup handles the S3 objects
  the cascade cannot reach.

## Operator steps (AWS)

Use a non-production AWS account if one exists; otherwise the production
account is acceptable only because the IAM policy is bucket- and
prefix-scoped. Never reuse or modify the production bucket or its IAM
principals.

1. **Bucket.** Create a new, dedicated bucket. Recommended name
   `hc-violins-staging-e2e` (add a random suffix if taken; the name must keep
   a `staging` token and must not contain `prod`). Recommended region
   `us-west-1` (same as production, for parity). Object Ownership: _Bucket
   owner enforced_ (ACLs disabled). Versioning: **disabled** (deletes must
   be real deletes; if it is ever enabled, add a
   `NoncurrentVersionExpiration` of 1 day to the lifecycle rule). Default
   encryption: SSE-S3 (the app sends `AES256`; no KMS key is needed).
2. **Block Public Access**: all four settings on —
   [`staging-storage-e2e-public-access-block.json`](./staging-storage-e2e-public-access-block.json).
3. **Lifecycle** on prefix `e2e/`: expire after 1 day, abort incomplete
   multipart uploads after 1 day —
   [`staging-storage-e2e-lifecycle.json`](./staging-storage-e2e-lifecycle.json).
4. **Bucket policy (recommended)**: AWS's standard deny-only TLS guard — a
   single `"Effect": "Deny"` statement for all principals and all S3 actions
   on the bucket and its objects with
   `"Condition": {"Bool": {"aws:SecureTransport": "false"}}`. It grants
   nothing.
5. **IAM user** dedicated to this purpose (e.g. `hc-violins-staging-e2e-ci`),
   programmatic access only, no console login, no group with other
   permissions, and exactly this inline policy with
   `STAGING_E2E_BUCKET_NAME` replaced by the bucket name —
   [`staging-storage-e2e-iam-policy.json`](./staging-storage-e2e-iam-policy.json):
   - `s3:ListBucket` on `arn:aws:s3:::<bucket>` only with
     `StringLike s3:prefix = e2e/*`;
   - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on
     `arn:aws:s3:::<bucket>/e2e/*` only.
   - No `s3:*`, no `*` resource, no production bucket ARN, no KMS, no IAM.
   - Note: without an unconditioned `s3:ListBucket`, a HEAD of a missing key
     returns 403 instead of 404. The routes do not rely on that.
6. Create one access key for that user. Rotate by creating a second key,
   updating the GitHub secret, then deleting the old key.

## Operator steps (GitHub, repository level)

To avoid a red E2E window while provisioning, set the flag to `false` first.

| Kind     | Name                                | Value                                              |
| -------- | ----------------------------------- | -------------------------------------------------- |
| variable | `E2E_STAGING_STORAGE_ENABLED`       | `false` first; `true` once everything below is set |
| variable | `E2E_STAGING_S3_BUCKET_NAME`        | the staging bucket name                            |
| variable | `E2E_STAGING_S3_REGION`             | e.g. `us-west-1`                                   |
| variable | `PRODUCTION_S3_BUCKET_NAME`         | the production bucket name (deny target only)      |
| secret   | `E2E_STAGING_AWS_ACCESS_KEY_ID`     | the dedicated IAM user's key id                    |
| secret   | `E2E_STAGING_AWS_SECRET_ACCESS_KEY` | its secret                                         |

Then set `E2E_STAGING_STORAGE_ENABLED=true` and re-run a PR's CI. The
`Configure staging storage E2E` step should log
`{"stagingStorage":"enabled",...,"objectPrefix":"e2e/<scopeKey>/"}` and the
cleanup step `{"storageCleanup":"ran",...,"residualTotal":0}`.

## Not covered here (follow-ups)

- The image/certificate lifecycle E2E spec itself (G2).
- Browser rendering of staging-bucket images: the CSP `img-src` and
  `next.config.ts` `images.remotePatterns` allow only the production bucket
  host, so presigned staging URLs work for API-level assertions but will not
  render in `<img>`. A UI-level spec needs an env-gated allowance.
- Invoice images in the staging Supabase `invoices` bucket under the
  run-scoped `<orgId>/` path are not removed by org teardown.
- The hosted staging Vercel deployment's own storage env is not part of
  this contract.
