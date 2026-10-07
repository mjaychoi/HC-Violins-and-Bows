import { createHash } from 'crypto';
import path from 'path';

export const DEFAULT_E2E_ORG_ID = '00000000-0000-4000-8000-0000000000e2';

export const ADMIN_AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');

export const MEMBER_AUTH_STATE_PATH = path.join(
  __dirname,
  '.auth',
  'member.json'
);

/**
 * Marker embedded in every run-scoped E2E email and org name. Cleanup refuses
 * to touch an identity that does not carry `${E2E_RUN_SCOPE_MARKER}-<scopeKey>-`.
 */
export const E2E_RUN_SCOPE_MARKER = 'hcve2e';

/**
 * Run-scoped users live on an RFC 6761 reserved domain: nothing is ever
 * delivered there, and the address does not depend on (or reveal) the shape
 * of the E2E_TEST_EMAIL secret. The hosted export E2E already creates and
 * signs in `@example.test` users on the same staging project.
 */
export const E2E_RUN_SCOPE_EMAIL_DOMAIN = 'example.test';

/** Fixed RFC 4122 namespace for HC Violins run-scoped E2E org UUIDs (v5). */
const E2E_ORG_UUID_NAMESPACE = '6f1c2a4e-9d3b-4c57-8e21-3a5b7c9d0e14';

const SCOPE_KEY_RE = /^[0-9a-f]{12}$/;
const LABEL_RE = /^[a-z][a-z0-9-]{0,30}$/;
const MAX_RAW_SCOPE_LENGTH = 256;

export type E2EEnv = Record<string, string | undefined>;

export type E2ERole = 'admin' | 'member';

/** Run-scoped org slots. 'secondary' is the cross-tenant counterpart org. */
export type E2EOrgSlot = 'primary' | 'secondary';

/**
 * Every run-scoped identity, by email label. The label (not the role) is what
 * makes each derived email distinct: the primary admin and the secondary
 * admin share role 'admin' but live in different orgs.
 */
export type E2EIdentityLabel = 'admin' | 'member' | 'secondary-admin';

export const E2E_SECONDARY_ORG_SLOT: E2EOrgSlot = 'secondary';
export const E2E_SECONDARY_ADMIN_LABEL: E2EIdentityLabel = 'secondary-admin';

export type E2EIdentity = {
  email: string;
  password: string;
  orgId: string;
  role: E2ERole;
};

/**
 * Hosted E2E mode: CI, or the critical suite aimed at the allowlisted hosted
 * staging project. In this mode a missing E2E_RUN_SCOPE is an error, never a
 * silent fallback to the shared E2E_TEST_* identities.
 */
export function requiresRunScopedE2E(env: E2EEnv = process.env): boolean {
  if (env.CI === 'true') return true;
  return (
    env.PLAYWRIGHT_SUITE === 'critical' &&
    Boolean(env.STAGING_SUPABASE_PROJECT_REF?.trim())
  );
}

/** Raw E2E_RUN_SCOPE (trimmed), or null for a local legacy run. */
export function getE2ERunScope(env: E2EEnv = process.env): string | null {
  const raw = env.E2E_RUN_SCOPE?.trim();
  if (raw) return raw;

  if (requiresRunScopedE2E(env)) {
    throw new Error(
      'E2E_RUN_SCOPE is required for hosted/CI E2E so each run gets its own users and organization. Refusing to fall back to the shared E2E_TEST_* identities.'
    );
  }
  return null;
}

export function isRunScopedE2E(env: E2EEnv = process.env): boolean {
  return getE2ERunScope(env) !== null;
}

/**
 * Deterministic, bounded, hex-only key for a raw run scope. The raw value
 * (e.g. a GitHub run id) never reaches an email, org name, or DB identifier.
 */
export function normalizeE2ERunScope(rawScope: string): string {
  const scope = rawScope.trim();
  if (!scope) {
    throw new Error('E2E run scope must be a non-empty string.');
  }
  if (scope.length > MAX_RAW_SCOPE_LENGTH) {
    throw new Error(
      `E2E run scope must be at most ${MAX_RAW_SCOPE_LENGTH} characters.`
    );
  }
  return createHash('sha256')
    .update(`hc-violins-e2e-run-scope:v1:${scope}`)
    .digest('hex')
    .slice(0, 12);
}

export function getE2ERunScopeKey(env: E2EEnv = process.env): string | null {
  const scope = getE2ERunScope(env);
  return scope === null ? null : normalizeE2ERunScope(scope);
}

export function assertE2ERunScopeKey(scopeKey: string): void {
  if (!SCOPE_KEY_RE.test(scopeKey)) {
    throw new Error('E2E run scope key is malformed.');
  }
}

function assertLabel(label: string, kind: string): void {
  if (!LABEL_RE.test(label)) {
    throw new Error(`E2E ${kind} label is malformed.`);
  }
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** RFC 4122 name-based (SHA-1, version 5) UUID. */
export function uuidV5(name: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(uuidToBytes(namespace))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

/**
 * Org UUID for one run scope. `slot` lets later suites derive further
 * run-scoped orgs (e.g. 'secondary' for cross-tenant tests) without a new
 * scheme. Always version 5, so it can never equal DEFAULT_E2E_ORG_ID (v4).
 */
export function deriveE2EOrgId(scopeKey: string, slot = 'primary'): string {
  assertE2ERunScopeKey(scopeKey);
  assertLabel(slot, 'org slot');
  return uuidV5(`org:${slot}:${scopeKey}`, E2E_ORG_UUID_NAMESPACE);
}

export function deriveE2EOrgName(scopeKey: string, slot = 'primary'): string {
  assertE2ERunScopeKey(scopeKey);
  assertLabel(slot, 'org slot');
  const suffix = slot === 'primary' ? '' : ` ${slot}`;
  return `HC Violins E2E ${scopeKey}${suffix}`;
}

/** `hcve2e-<scopeKey>-<label>@example.test`, e.g. label 'admin'. */
export function deriveE2EScopedEmail(scopeKey: string, label: string): string {
  assertE2ERunScopeKey(scopeKey);
  assertLabel(label, 'identity');
  return `${E2E_RUN_SCOPE_MARKER}-${scopeKey}-${label}@${E2E_RUN_SCOPE_EMAIL_DOMAIN}`;
}

export function e2eScopedEmailMarker(scopeKey: string): string {
  assertE2ERunScopeKey(scopeKey);
  return `${E2E_RUN_SCOPE_MARKER}-${scopeKey}-`;
}

export function getE2EOrgId(env: E2EEnv = process.env): string {
  const scopeKey = getE2ERunScopeKey(env);
  if (scopeKey) return deriveE2EOrgId(scopeKey);
  return env.E2E_TEST_ORG_ID?.trim() || DEFAULT_E2E_ORG_ID;
}

export function getE2EOrgName(env: E2EEnv = process.env): string {
  const scopeKey = getE2ERunScopeKey(env);
  if (scopeKey) return deriveE2EOrgName(scopeKey);
  return env.E2E_TEST_ORG_NAME || 'HC Violins and Bows';
}

export function getE2EAdminIdentity(env: E2EEnv = process.env): E2EIdentity {
  const scopeKey = getE2ERunScopeKey(env);
  return {
    email: scopeKey
      ? deriveE2EScopedEmail(scopeKey, 'admin')
      : env.E2E_TEST_EMAIL?.trim() || 'test@test.com',
    password: env.E2E_TEST_PASSWORD || 'test123',
    orgId: getE2EOrgId(env),
    role: 'admin',
  };
}

export function getE2EMemberIdentity(env: E2EEnv = process.env): E2EIdentity {
  const scopeKey = getE2ERunScopeKey(env);
  return {
    email: scopeKey
      ? deriveE2EScopedEmail(scopeKey, 'member')
      : env.E2E_TEST_MEMBER_EMAIL?.trim() || 'e2e-member@test.com',
    password: env.E2E_TEST_MEMBER_PASSWORD || 'test123',
    orgId: getE2EOrgId(env),
    role: 'member',
  };
}

function requireRunScopeKeyFor(env: E2EEnv, purpose: string): string {
  const scopeKey = getE2ERunScopeKey(env);
  if (!scopeKey) {
    throw new Error(
      `${purpose} requires E2E_RUN_SCOPE: the secondary org only exists as a run-scoped fixture, never as a shared E2E_TEST_* org.`
    );
  }
  return scopeKey;
}

/** The run-scoped secondary (cross-tenant) org id. Run-scoped mode only. */
export function getE2ESecondaryOrgId(env: E2EEnv = process.env): string {
  return deriveE2EOrgId(
    requireRunScopeKeyFor(env, 'The secondary E2E org'),
    E2E_SECONDARY_ORG_SLOT
  );
}

/**
 * Admin of the run-scoped secondary org, used by cross-tenant specs to own
 * resources the primary admin must not reach. Same password secret as the
 * primary admin; a distinct derived email and org. Run-scoped mode only.
 */
export function getE2ESecondaryAdminIdentity(
  env: E2EEnv = process.env
): E2EIdentity {
  const scopeKey = requireRunScopeKeyFor(env, 'The secondary E2E admin');
  return {
    email: deriveE2EScopedEmail(scopeKey, E2E_SECONDARY_ADMIN_LABEL),
    password: env.E2E_TEST_PASSWORD || 'test123',
    orgId: deriveE2EOrgId(scopeKey, E2E_SECONDARY_ORG_SLOT),
    role: 'admin',
  };
}
