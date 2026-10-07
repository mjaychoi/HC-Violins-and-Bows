/**
 * Hosted staging storage E2E contract (S3 instrument images / certificates).
 *
 * Operator setup and the exact GitHub variable/secret names:
 * docs/ops/staging-storage-e2e.md.
 *
 * Modes (decided by resolveStagingStorageE2E, never by a fallback):
 *   - disabled: E2E_STAGING_STORAGE_ENABLED unset/'' and no storage inputs, or
 *     explicitly 'false'. The job keeps the inert `e2e-ci-placeholder` bucket
 *     with no credentials and no key prefix, exactly as before this contract.
 *   - enabled: E2E_STAGING_STORAGE_ENABLED='true' and every input passes the
 *     staging-only checks below. The app gets the staging bucket, its
 *     dedicated least-privilege credentials, and
 *     STORAGE_E2E_KEY_PREFIX=e2e/<scopeKey>, so every object it writes lives
 *     under `e2e/<scopeKey>/`.
 *   - anything else (partial inputs, unknown flag value, any failed check)
 *     throws. There is no fallback to the placeholder, the legacy repo
 *     `S3_*` secrets, or an unscoped key.
 *
 * Error messages name keys only, never values.
 */
import { assertE2EStagingProjectAllowlist } from '../../scripts/assert-e2e-staging-project-allowlist';

import {
  assertE2ERunScopeKey,
  getE2ERunScopeKey,
  type E2EEnv,
} from './e2e-identities';

export const STAGING_STORAGE_ENABLED_VAR = 'E2E_STAGING_STORAGE_ENABLED';

/** Raw operator inputs. The app never reads these names directly. */
export const STAGING_STORAGE_INPUT_KEYS = [
  'E2E_STAGING_S3_BUCKET_NAME',
  'E2E_STAGING_S3_REGION',
  'E2E_STAGING_AWS_ACCESS_KEY_ID',
  'E2E_STAGING_AWS_SECRET_ACCESS_KEY',
] as const;

/** Repository variable naming the production bucket, as a deny target. */
export const PRODUCTION_S3_BUCKET_VAR = 'PRODUCTION_S3_BUCKET_NAME';

/** Inert bucket the E2E job has always used when storage E2E is off. */
export const STAGING_STORAGE_PLACEHOLDER_BUCKET = 'e2e-ci-placeholder';

/**
 * Known production bucket (also hard-coded in next.config.ts CSP/images).
 * Always denied, even if PRODUCTION_S3_BUCKET_NAME is wrong.
 */
export const KNOWN_PRODUCTION_S3_BUCKETS: readonly string[] = ['hc-bows'];

/** Env the configure step exports to later steps (and the app server). */
export const STAGING_STORAGE_MODE_ENV = 'E2E_STAGING_STORAGE_MODE';
export const STORAGE_E2E_KEY_PREFIX_ENV = 'STORAGE_E2E_KEY_PREFIX';

/** App-facing keys that must stay untouched while storage E2E is disabled. */
export const APP_STORAGE_CREDENTIAL_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_ENDPOINT_URL',
  STORAGE_E2E_KEY_PREFIX_ENV,
] as const;

const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const STAGING_TOKEN_RE = /(^|[.-])staging([.-]|$)/;
const PRODUCTION_TOKEN_RE = /(^|[.-])prod(uction)?([.-]|$)/;
const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
const ACCESS_KEY_ID_RE = /^AKIA[A-Z0-9]{16}$/;
const SECRET_ACCESS_KEY_RE = /^[A-Za-z0-9/+=]{40}$/;

export type StagingStorageDisabled = {
  mode: 'disabled';
  reason: 'not-configured' | 'explicitly-disabled';
};

export type StagingStorageEnabled = {
  mode: 'enabled';
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  scopeKey: string;
  /** `e2e/<scopeKey>/` — the only prefix cleanup may list or delete. */
  objectPrefix: string;
  /** `e2e/<scopeKey>` — the app's STORAGE_E2E_KEY_PREFIX value. */
  keyPrefix: string;
};

export type StagingStorageResolution =
  | StagingStorageDisabled
  | StagingStorageEnabled;

function blocked(message: string): Error {
  return new Error(`Staging storage guard blocked: ${message}`);
}

function read(env: E2EEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

/** `e2e/<scopeKey>` (no trailing slash): the app-facing prefix value. */
export function e2eStorageKeyPrefix(scopeKey: string): string {
  assertE2ERunScopeKey(scopeKey);
  return `e2e/${scopeKey}`;
}

/** `e2e/<scopeKey>/`: the exact object namespace one run owns. */
export function e2eStorageObjectPrefix(scopeKey: string): string {
  return `${e2eStorageKeyPrefix(scopeKey)}/`;
}

/**
 * Staging-only bucket check. Requires a `staging` name token, refuses a
 * production token, the placeholder, the known production bucket(s), and the
 * declared production bucket.
 */
export function assertStagingBucketName(
  bucket: string,
  productionBucket: string
): void {
  if (!BUCKET_NAME_RE.test(bucket) || IPV4_RE.test(bucket)) {
    throw blocked('E2E_STAGING_S3_BUCKET_NAME is not a valid S3 bucket name.');
  }
  if (bucket.includes('..')) {
    throw blocked('E2E_STAGING_S3_BUCKET_NAME is not a valid S3 bucket name.');
  }
  if (bucket === STAGING_STORAGE_PLACEHOLDER_BUCKET) {
    throw blocked(
      'E2E_STAGING_S3_BUCKET_NAME is the inert placeholder, not a staging bucket.'
    );
  }
  if (
    KNOWN_PRODUCTION_S3_BUCKETS.includes(bucket) ||
    (productionBucket !== '' && bucket === productionBucket)
  ) {
    throw blocked('E2E_STAGING_S3_BUCKET_NAME is the production bucket.');
  }
  if (PRODUCTION_TOKEN_RE.test(bucket)) {
    throw blocked(
      'E2E_STAGING_S3_BUCKET_NAME carries a production name token.'
    );
  }
  if (!STAGING_TOKEN_RE.test(bucket)) {
    throw blocked(
      'E2E_STAGING_S3_BUCKET_NAME must contain a "staging" name token (e.g. hc-violins-staging-e2e).'
    );
  }
}

export function resolveStagingStorageE2E(
  env: E2EEnv = process.env
): StagingStorageResolution {
  const flag = read(env, STAGING_STORAGE_ENABLED_VAR);
  const presentInputs = STAGING_STORAGE_INPUT_KEYS.filter(
    key => read(env, key) !== ''
  );

  if (flag !== '' && flag !== 'true' && flag !== 'false') {
    throw blocked(
      `${STAGING_STORAGE_ENABLED_VAR} must be "true", "false", or unset.`
    );
  }

  if (flag === 'false') {
    return { mode: 'disabled', reason: 'explicitly-disabled' };
  }

  if (flag === '') {
    if (presentInputs.length === 0) {
      return { mode: 'disabled', reason: 'not-configured' };
    }
    throw blocked(
      `staging storage inputs are partially configured (${presentInputs.join(', ')}) but ${STAGING_STORAGE_ENABLED_VAR} is unset. Set it to "true" to enable, or "false" to pause explicitly.`
    );
  }

  const missing = STAGING_STORAGE_INPUT_KEYS.filter(
    key => !presentInputs.includes(key)
  );
  if (missing.length > 0) {
    throw blocked(
      `${STAGING_STORAGE_ENABLED_VAR}=true but required inputs are missing: ${missing.join(', ')}.`
    );
  }

  const productionBucket = read(env, PRODUCTION_S3_BUCKET_VAR);
  if (!productionBucket) {
    throw blocked(
      `${PRODUCTION_S3_BUCKET_VAR} must be set (as a deny target) when staging storage E2E is enabled.`
    );
  }

  // Storage E2E only ever runs against the allowlisted staging Supabase
  // project, never production.
  assertE2EStagingProjectAllowlist(env);

  if (read(env, 'STORAGE_TYPE') !== 's3') {
    throw blocked('STORAGE_TYPE must be "s3" for staging storage E2E.');
  }
  if (read(env, 'AWS_ENDPOINT_URL') || read(env, 'AWS_SESSION_TOKEN')) {
    throw blocked(
      'AWS_ENDPOINT_URL / AWS_SESSION_TOKEN must not be set for staging storage E2E.'
    );
  }

  const bucket = read(env, 'E2E_STAGING_S3_BUCKET_NAME');
  assertStagingBucketName(bucket, productionBucket);

  const region = read(env, 'E2E_STAGING_S3_REGION');
  if (!REGION_RE.test(region)) {
    throw blocked('E2E_STAGING_S3_REGION is not a valid AWS region.');
  }

  const accessKeyId = read(env, 'E2E_STAGING_AWS_ACCESS_KEY_ID');
  if (!ACCESS_KEY_ID_RE.test(accessKeyId)) {
    throw blocked(
      'E2E_STAGING_AWS_ACCESS_KEY_ID is not a long-term IAM user access key id.'
    );
  }

  const secretAccessKey = read(env, 'E2E_STAGING_AWS_SECRET_ACCESS_KEY');
  if (!SECRET_ACCESS_KEY_RE.test(secretAccessKey)) {
    throw blocked('E2E_STAGING_AWS_SECRET_ACCESS_KEY is malformed.');
  }

  const scopeKey = getE2ERunScopeKey(env);
  if (!scopeKey) {
    throw blocked('E2E_RUN_SCOPE is required for staging storage E2E.');
  }
  assertE2ERunScopeKey(scopeKey);

  return {
    mode: 'enabled',
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    scopeKey,
    objectPrefix: e2eStorageObjectPrefix(scopeKey),
    keyPrefix: e2eStorageKeyPrefix(scopeKey),
  };
}

/**
 * Lines for $GITHUB_ENV. Disabled mode exports only the mode marker, so the
 * app keeps the placeholder bucket and no credentials.
 */
export function buildStagingStorageGithubEnv(
  resolution: StagingStorageResolution
): string[] {
  if (resolution.mode === 'disabled') {
    return [`${STAGING_STORAGE_MODE_ENV}=disabled`];
  }
  return [
    `${STAGING_STORAGE_MODE_ENV}=enabled`,
    `S3_BUCKET_NAME=${resolution.bucket}`,
    `S3_REGION=${resolution.region}`,
    `AWS_ACCESS_KEY_ID=${resolution.accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${resolution.secretAccessKey}`,
    `${STORAGE_E2E_KEY_PREFIX_ENV}=${resolution.keyPrefix}`,
  ];
}

/**
 * Before the configure step exports anything: the disabled job must still be
 * exactly the inert placeholder setup (no app credentials, no prefix).
 */
export function assertInertPlaceholderStorageEnv(env: E2EEnv): void {
  if (read(env, 'S3_BUCKET_NAME') !== STAGING_STORAGE_PLACEHOLDER_BUCKET) {
    throw blocked(
      `with staging storage E2E disabled, S3_BUCKET_NAME must be the "${STAGING_STORAGE_PLACEHOLDER_BUCKET}" placeholder.`
    );
  }
  const leaked = APP_STORAGE_CREDENTIAL_KEYS.filter(key => read(env, key));
  if (leaked.length > 0) {
    throw blocked(
      `with staging storage E2E disabled, these must be unset: ${leaked.join(', ')}.`
    );
  }
}

/**
 * After $GITHUB_ENV took effect: the env later steps (and the app) see must
 * match the resolution exactly. Catches an override that did not apply.
 */
export function assertEffectiveStorageEnv(
  env: E2EEnv,
  resolution: StagingStorageResolution
): void {
  const mode = read(env, STAGING_STORAGE_MODE_ENV);
  if (mode !== resolution.mode) {
    throw blocked(`${STAGING_STORAGE_MODE_ENV} does not match the resolution.`);
  }

  if (resolution.mode === 'disabled') {
    assertInertPlaceholderStorageEnv(env);
    return;
  }

  const expected: Record<string, string> = {
    S3_BUCKET_NAME: resolution.bucket,
    S3_REGION: resolution.region,
    AWS_ACCESS_KEY_ID: resolution.accessKeyId,
    AWS_SECRET_ACCESS_KEY: resolution.secretAccessKey,
    [STORAGE_E2E_KEY_PREFIX_ENV]: resolution.keyPrefix,
  };
  const mismatched = Object.keys(expected).filter(
    key => (env[key] ?? '') !== expected[key]
  );
  if (mismatched.length > 0) {
    throw blocked(
      `effective app storage env does not match the validated staging config: ${mismatched.join(', ')}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Scoped cleanup
// ---------------------------------------------------------------------------

/** Minimal object-store surface cleanup needs (fakeable in unit tests). */
export type ScopedObjectStore = {
  listObjects(input: {
    bucket: string;
    prefix: string;
    continuationToken?: string;
  }): Promise<{ keys: string[]; nextContinuationToken?: string }>;
  deleteObjects(input: {
    bucket: string;
    keys: string[];
  }): Promise<{ errors: Array<{ key: string; code?: string }> }>;
};

export type ScopedCleanupResult = {
  bucket: string;
  objectPrefix: string;
  deleted: number;
  residualTotal: number;
};

/** S3 DeleteObjects accepts at most 1000 keys per request. */
export const DELETE_BATCH_SIZE = 1000;
const MAX_LIST_PAGES = 1000;

async function listScopedKeys(
  store: ScopedObjectStore,
  bucket: string,
  objectPrefix: string
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await store.listObjects({
      bucket,
      prefix: objectPrefix,
      continuationToken,
    });
    for (const key of result.keys) {
      // Defense in depth: never act on a key outside the exact namespace,
      // whatever the store returned.
      if (!key.startsWith(objectPrefix) || key.length <= objectPrefix.length) {
        throw blocked(
          'object listing returned a key outside the run-scoped prefix; refusing to delete anything.'
        );
      }
      keys.push(key);
    }
    if (!result.nextContinuationToken) {
      return keys;
    }
    continuationToken = result.nextContinuationToken;
  }
  throw blocked('object listing did not terminate.');
}

/**
 * Deletes exactly the objects under `e2e/<scopeKey>/` and verifies none are
 * left. Idempotent: a second call (or an empty namespace) is a verified
 * no-op. Refuses an empty or malformed scope key.
 */
export async function cleanupRunScopedStorage(
  store: ScopedObjectStore,
  input: { bucket: string; scopeKey: string }
): Promise<ScopedCleanupResult> {
  if (!input.bucket) {
    throw blocked('cleanup bucket is missing.');
  }
  const objectPrefix = e2eStorageObjectPrefix(input.scopeKey);

  const keys = await listScopedKeys(store, input.bucket, objectPrefix);

  const failures: Array<{ key: string; code?: string }> = [];
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    const { errors } = await store.deleteObjects({
      bucket: input.bucket,
      keys: batch,
    });
    failures.push(...errors);
  }

  if (failures.length > 0) {
    const codes = [...new Set(failures.map(f => f.code ?? 'unknown'))];
    throw new Error(
      `Staging storage cleanup failed for ${failures.length} object(s) (codes: ${codes.join(', ')}).`
    );
  }

  const residual = await listScopedKeys(store, input.bucket, objectPrefix);
  if (residual.length > 0) {
    throw new Error(
      `Staging storage cleanup left ${residual.length} residual object(s) under the run-scoped prefix.`
    );
  }

  return {
    bucket: input.bucket,
    objectPrefix,
    deleted: keys.length,
    residualTotal: 0,
  };
}

type ListObjectsInput = {
  Bucket: string;
  Prefix: string;
  ContinuationToken?: string;
};
type DeleteObjectsInput = {
  Bucket: string;
  Delete: { Objects: Array<{ Key: string }>; Quiet: boolean };
};

/**
 * Adapter over an AWS SDK v3 S3Client. Takes the command classes as
 * arguments so unit tests can drive it with a fake `send`.
 */
export function createS3ScopedObjectStore(
  client: { send(command: unknown): Promise<unknown> },
  commands: {
    ListObjectsV2Command: new (input: ListObjectsInput) => unknown;
    DeleteObjectsCommand: new (input: DeleteObjectsInput) => unknown;
  }
): ScopedObjectStore {
  return {
    async listObjects({ bucket, prefix, continuationToken }) {
      const output = (await client.send(
        new commands.ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ...(continuationToken
            ? { ContinuationToken: continuationToken }
            : {}),
        })
      )) as {
        Contents?: Array<{ Key?: string }>;
        IsTruncated?: boolean;
        NextContinuationToken?: string;
      };
      return {
        keys: (output.Contents ?? [])
          .map(item => item.Key)
          .filter((key): key is string => typeof key === 'string'),
        nextContinuationToken: output.IsTruncated
          ? output.NextContinuationToken
          : undefined,
      };
    },
    async deleteObjects({ bucket, keys }) {
      const output = (await client.send(
        new commands.DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
        })
      )) as { Errors?: Array<{ Key?: string; Code?: string }> };
      return {
        errors: (output.Errors ?? []).map(error => ({
          key: error.Key ?? '',
          code: error.Code,
        })),
      };
    },
  };
}
