/**
 * Run-scoped object-key namespace for hosted staging storage E2E.
 *
 * When STORAGE_E2E_KEY_PREFIX is unset (every real deployment), nothing here
 * changes a key: writes keep the route-built `<orgId>/<instrumentId>/...`
 * layout byte-for-byte and reads/deletes are not checked.
 *
 * When it is set (only by the CI E2E job, after
 * tests/e2e/configure-staging-storage-e2e.ts validated a staging-only bucket),
 * S3Storage:
 *   - prefixes every written key with `e2e/<scopeKey>/` and returns the
 *     prefixed key, which routes persist as storage_key / storage_path;
 *   - refuses to read, delete, or presign any key outside that namespace.
 *
 * The value is fail-closed: it must be exactly `e2e/<12 lowercase hex>` (the
 * scopeKey from tests/e2e/e2e-identities.ts) and is refused on a Vercel
 * production runtime. `check:env` / `deploy:build` also reject it for every
 * Vercel deployment (see src/config/env/production.ts).
 *
 * Pure module (no `server-only`) so env validation can share it.
 */

export const STORAGE_E2E_KEY_PREFIX_ENV = 'STORAGE_E2E_KEY_PREFIX';

const E2E_KEY_PREFIX_RE = /^e2e\/[0-9a-f]{12}$/;

type EnvLike = Record<string, string | undefined>;

/**
 * Returns the validated prefix (no trailing slash), or undefined when unset.
 * Throws — never ignores — a malformed value or a production runtime.
 * Error messages never echo the value.
 */
export function parseStorageE2EKeyPrefix(env: EnvLike): string | undefined {
  const raw = env[STORAGE_E2E_KEY_PREFIX_ENV];
  if (raw === undefined || raw === '') {
    return undefined;
  }

  if (!E2E_KEY_PREFIX_RE.test(raw)) {
    throw new Error(
      `${STORAGE_E2E_KEY_PREFIX_ENV} is malformed. Expected exactly "e2e/<12 lowercase hex scope key>".`
    );
  }

  if (env.VERCEL_ENV === 'production') {
    throw new Error(
      `${STORAGE_E2E_KEY_PREFIX_ENV} must never be set on a production deployment.`
    );
  }

  return raw;
}

/**
 * Key actually written for a requested key. Identity when no prefix is set.
 * Idempotent: a key already inside this run's namespace is kept as-is.
 */
export function applyE2EKeyPrefix(
  prefix: string | undefined,
  key: string
): string {
  if (!prefix) {
    return key;
  }

  if (isInE2ENamespace(prefix, key)) {
    return key;
  }

  if (!key || key.startsWith('/')) {
    throw new Error(
      'Refusing to write an empty or absolute storage key in E2E storage mode.'
    );
  }

  return `${prefix}/${key}`;
}

/** Throws when a prefix is set and the key is outside `<prefix>/`. */
export function assertKeyInE2ENamespace(
  prefix: string | undefined,
  key: string
): void {
  if (!prefix) {
    return;
  }

  if (!isInE2ENamespace(prefix, key)) {
    throw new Error(
      "Storage key is outside this run's E2E storage namespace; refusing to access it."
    );
  }
}

function isInE2ENamespace(prefix: string, key: string): boolean {
  const namespace = `${prefix}/`;
  return key.startsWith(namespace) && key.length > namespace.length;
}
