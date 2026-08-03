/**
 * Pure, secret-safe guard functions for the production migration deployment
 * workflow (.github/workflows/production-db-deploy.yml).
 *
 * These functions never read environment variables directly and never
 * return or log credentials, passwords, full connection strings, hostnames,
 * or project refs.
 */
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Local migration filename parsing (canonical contract shared with
// scripts/check-active-migrations.js: 14-digit timestamp prefix).
// ---------------------------------------------------------------------------

const LOCAL_MIGRATION_FILENAME_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;
const REMOTE_VERSION_PATTERN = /^\d{14}$/;
const MAX_LISTED_ITEMS = 10;

export type LocalMigration = {
  version: string;
  filename: string;
};

function summarizeList(items: readonly string[]): string {
  if (items.length === 0) {
    return '(none)';
  }
  const shown = items.slice(0, MAX_LISTED_ITEMS);
  const suffix =
    items.length > MAX_LISTED_ITEMS
      ? `, and ${items.length - MAX_LISTED_ITEMS} more`
      : '';
  return `${shown.join(', ')}${suffix}`;
}

/**
 * Parses local migration filenames using the repository's canonical
 * filename contract. Only files ending in `.sql` are considered; any such
 * file that does not match the canonical `<14-digit-version>_<slug>.sql`
 * pattern is treated as a hard failure rather than being silently skipped,
 * so a stray/legacy `.sql` file can never be dropped from the count without
 * anyone noticing. Duplicate versions are also a hard failure.
 */
export function parseLocalMigrationFilenames(
  filenames: readonly string[]
): LocalMigration[] {
  const malformed: string[] = [];
  const byVersion = new Map<string, string[]>();

  for (const filename of filenames) {
    if (!filename.endsWith('.sql')) {
      continue;
    }

    const match = LOCAL_MIGRATION_FILENAME_PATTERN.exec(filename);
    if (!match) {
      malformed.push(filename);
      continue;
    }

    const version = match[1];
    const existing = byVersion.get(version);
    if (existing) {
      existing.push(filename);
    } else {
      byVersion.set(version, [filename]);
    }
  }

  if (malformed.length > 0) {
    throw new Error(
      `Malformed local migration filename(s) found (must match ${LOCAL_MIGRATION_FILENAME_PATTERN}): ${summarizeList(malformed.sort())}. Refusing to reconcile.`
    );
  }

  const duplicates = [...byVersion.entries()].filter(
    ([, files]) => files.length > 1
  );
  if (duplicates.length > 0) {
    const detail = duplicates
      .map(([version, files]) => `${version} (${files.join(', ')})`)
      .sort();
    throw new Error(
      `Duplicate local migration version(s) found: ${summarizeList(detail)}. Refusing to reconcile.`
    );
  }

  return [...byVersion.entries()]
    .map(([version, files]) => ({ version, filename: files[0] }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

// ---------------------------------------------------------------------------
// Remote migration-history version parsing.
// ---------------------------------------------------------------------------

export type RemoteVersionParseResult = {
  uniqueVersions: string[];
  duplicateVersions: string[];
};

/**
 * Normalizes and validates remote `supabase_migrations.schema_migrations`
 * version values. Malformed values are a hard failure. Duplicates are
 * detected and reported, but not thrown here so callers can decide how to
 * surface them (reconcileMigrationVersions fails closed on any duplicate).
 */
export function parseRemoteVersions(
  rawVersions: readonly string[]
): RemoteVersionParseResult {
  const malformed: string[] = [];
  const counts = new Map<string, number>();

  for (const raw of rawVersions) {
    const version = raw.trim();
    if (!REMOTE_VERSION_PATTERN.test(version)) {
      malformed.push(raw);
      continue;
    }
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }

  if (malformed.length > 0) {
    throw new Error(
      `Malformed remote migration version(s) found in supabase_migrations.schema_migrations: ${summarizeList(malformed.map(v => JSON.stringify(v)))}. Refusing to reconcile.`
    );
  }

  const duplicateVersions = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([version]) => version)
    .sort();
  const uniqueVersions = [...counts.keys()].sort();

  return { uniqueVersions, duplicateVersions };
}

// ---------------------------------------------------------------------------
// Exact version-set reconciliation (replaces count arithmetic).
// ---------------------------------------------------------------------------

export type MigrationReconciliation = {
  localVersionCount: number;
  remoteUniqueVersionCount: number;
  pendingVersions: string[];
  remoteOnlyVersions: string[];
  duplicateRemoteVersions: string[];
  /** Informational only — never used as a readiness signal. */
  latestApplied: string | null;
  pendingMigrationCount: number;
  pendingDigest: string;
};

/**
 * Reconciles the exact local migration version set against the exact set of
 * versions recorded in `supabase_migrations.schema_migrations`. Fails
 * closed (throws) on any of: a remote duplicate version, a malformed remote
 * version, or a remote-only version (a version applied in the database with
 * no corresponding local migration file). Local duplicates/malformed
 * filenames are already rejected by parseLocalMigrationFilenames before
 * this function is ever called.
 */
export function reconcileMigrationVersions(
  localMigrations: readonly LocalMigration[],
  rawRemoteVersions: readonly string[]
): MigrationReconciliation {
  const localVersions = localMigrations.map(m => m.version);
  const localSet = new Set(localVersions);

  const { uniqueVersions: remoteVersions, duplicateVersions } =
    parseRemoteVersions(rawRemoteVersions);

  if (duplicateVersions.length > 0) {
    throw new Error(
      `Duplicate version(s) found in remote migration history: ${summarizeList(duplicateVersions)}. Refusing to reconcile.`
    );
  }

  const remoteSet = new Set(remoteVersions);

  const remoteOnlyVersions = remoteVersions.filter(v => !localSet.has(v));
  if (remoteOnlyVersions.length > 0) {
    throw new Error(
      `Remote migration history contains version(s) with no corresponding local migration file: ${summarizeList(remoteOnlyVersions)}. Refusing to reconcile.`
    );
  }

  const pendingVersions = localVersions.filter(v => !remoteSet.has(v)).sort();

  return {
    localVersionCount: localVersions.length,
    remoteUniqueVersionCount: remoteVersions.length,
    pendingVersions,
    remoteOnlyVersions,
    duplicateRemoteVersions: duplicateVersions,
    latestApplied: remoteVersions.at(-1) ?? null,
    pendingMigrationCount: pendingVersions.length,
    pendingDigest: computePendingDigest(pendingVersions),
  };
}

/**
 * Canonical SHA-256 digest of a pending-version set.
 *
 * Stable representation: versions sorted ascending, one version per line,
 * UTF-8, each line (including the last) terminated by a single `\n`. An
 * empty set digests the empty string (not a single `\n`), so the digest of
 * zero pending migrations is `sha256('')`. Reordered input always produces
 * the same digest because the set is re-sorted before hashing; a changed
 * set (any added/removed/renamed version) always produces a different
 * digest.
 */
export function computePendingDigest(
  pendingVersions: readonly string[]
): string {
  const sorted = [...pendingVersions].sort();
  const content = sorted.length > 0 ? `${sorted.join('\n')}\n` : '';
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export type PendingSummary = {
  pendingMigrationCount: number;
  firstPendingVersion: string | null;
  lastPendingVersion: string | null;
  pendingDigest: string;
};

/**
 * Bounded summary suitable for logs: count + first/last version + digest.
 * Never includes the complete pending-version list.
 */
export function summarizePendingVersions(
  reconciliation: Pick<
    MigrationReconciliation,
    'pendingVersions' | 'pendingMigrationCount' | 'pendingDigest'
  >
): PendingSummary {
  return {
    pendingMigrationCount: reconciliation.pendingMigrationCount,
    firstPendingVersion: reconciliation.pendingVersions[0] ?? null,
    lastPendingVersion: reconciliation.pendingVersions.at(-1) ?? null,
    pendingDigest: reconciliation.pendingDigest,
  };
}

// ---------------------------------------------------------------------------
// Production endpoint identity + structural validation.
// ---------------------------------------------------------------------------

const SESSION_POOLER_HOST_PATTERN =
  /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const DIRECT_SUPABASE_HOST_PATTERN = /^db\.[a-z0-9]+\.supabase\.co$/;
const POOLER_USERNAME_PATTERN = /^postgres\.([a-z0-9]+)$/;
const PROJECT_REF_FORMAT_PATTERN = /^[a-z0-9]{16,}$/;
const SESSION_POOLER_PORT = '5432';
const TRANSACTION_POOLER_PORT = '6543';
const REQUIRED_DATABASE_NAME = 'postgres';

export type ProductionEndpointDescriptor = {
  endpointCategory: 'session-pooler';
  port: typeof SESSION_POOLER_PORT;
  database: typeof REQUIRED_DATABASE_NAME;
  projectMatch: true;
  ssl: 'require';
};

/** Exact safe log line: never a host, ref, username, password, or URL. */
export function describeProductionEndpointForLog(
  descriptor: ProductionEndpointDescriptor
): string {
  return `endpoint=${descriptor.endpointCategory} port=${descriptor.port} database=${descriptor.database} project_match=${descriptor.projectMatch ? 'yes' : 'no'} ssl=${descriptor.ssl}`;
}

function rejectCorruptedRawValue(rawUrl: string): void {
  if (/[\r\n]/.test(rawUrl)) {
    throw new Error(
      'DATABASE_URL contains embedded newline/carriage-return characters (possible corrupted secret). Refusing to proceed.'
    );
  }

  const trimmed = rawUrl.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    throw new Error(
      'DATABASE_URL appears to be wrapped in quote characters (possible corrupted secret). Refusing to proceed.'
    );
  }
}

/**
 * Validates that `rawUrl` is exactly the approved production Supabase
 * session-pooler endpoint for `expectedProjectRef`. This is an identity
 * check, not just a structural-validity check: a syntactically valid
 * Postgres URL pointing at any other host, port, database, or project is
 * rejected. Never logs the raw URL, host, project ref, username, or
 * password; returns only a non-reconstructable descriptor.
 */
export function validateProductionEndpoint(
  rawUrl: string | undefined,
  expectedProjectRef: string | undefined
): ProductionEndpointDescriptor {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('DATABASE_URL is required and was not provided.');
  }

  rejectCorruptedRawValue(rawUrl);

  const normalizedExpectedRef = expectedProjectRef?.trim().toLowerCase();
  if (!normalizedExpectedRef) {
    throw new Error(
      'EXPECTED_SUPABASE_PROJECT_REF is required and was not provided. Refusing to validate DATABASE_URL identity without an expected project reference.'
    );
  }
  if (!PROJECT_REF_FORMAT_PATTERN.test(normalizedExpectedRef)) {
    throw new Error(
      'EXPECTED_SUPABASE_PROJECT_REF is not in the expected lowercase-alphanumeric project-ref format.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a syntactically valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgres:// or postgresql:// scheme, got "${parsed.protocol}".`
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error('DATABASE_URL is missing a host.');
  }

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  ) {
    throw new Error(
      'DATABASE_URL targets localhost, which is never a valid production endpoint. Refusing to deploy.'
    );
  }

  if (DIRECT_SUPABASE_HOST_PATTERN.test(hostname)) {
    throw new Error(
      'DATABASE_URL targets a direct (non-pooler) Supabase database host. Only the session-pooler endpoint is approved for production deployment. Refusing to deploy.'
    );
  }

  if (!SESSION_POOLER_HOST_PATTERN.test(hostname)) {
    throw new Error(
      'DATABASE_URL host is not a recognized Supabase session-pooler endpoint. Refusing to deploy.'
    );
  }

  if (!parsed.password) {
    throw new Error('DATABASE_URL is missing credentials.');
  }

  const username = decodeURIComponent(parsed.username);
  const usernameMatch = POOLER_USERNAME_PATTERN.exec(username);
  if (!usernameMatch) {
    throw new Error(
      'DATABASE_URL username is not in the pooler project-scoped form "postgres.<project_ref>". Refusing to deploy.'
    );
  }

  const actualProjectRef = usernameMatch[1];
  if (actualProjectRef !== normalizedExpectedRef) {
    throw new Error(
      'DATABASE_URL project reference does not match the protected EXPECTED_SUPABASE_PROJECT_REF value. Refusing to deploy.'
    );
  }

  const port = parsed.port;
  if (port === TRANSACTION_POOLER_PORT) {
    throw new Error(
      `DATABASE_URL uses the transaction-pooler port (${TRANSACTION_POOLER_PORT}). Only the session-pooler port (${SESSION_POOLER_PORT}) is approved for production migration deployment. Refusing to deploy.`
    );
  }
  if (port !== SESSION_POOLER_PORT) {
    throw new Error(
      `DATABASE_URL must use the session-pooler port (${SESSION_POOLER_PORT}). Refusing to deploy.`
    );
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL is missing a database name.');
  }
  if (database !== REQUIRED_DATABASE_NAME) {
    throw new Error(
      `DATABASE_URL database must be "${REQUIRED_DATABASE_NAME}". Refusing to deploy.`
    );
  }

  if (parsed.searchParams.get('sslmode') !== 'require') {
    throw new Error(
      'DATABASE_URL must set sslmode=require. Refusing to deploy without enforced SSL.'
    );
  }

  return {
    endpointCategory: 'session-pooler',
    port: SESSION_POOLER_PORT,
    database: REQUIRED_DATABASE_NAME,
    projectMatch: true,
    ssl: 'require',
  };
}

// ---------------------------------------------------------------------------
// Secret-safe URL description (replaces the old reconstructable masked URL).
// ---------------------------------------------------------------------------

export type SafeUrlDescription = {
  parseable: boolean;
  scheme: string | null;
  hostCategory: 'supabase-session-pooler' | 'supabase-other' | 'other' | null;
  port: string | null;
  database: string | null;
  hasCredentials: boolean;
  sslRequired: boolean;
};

/**
 * Returns a structured, non-reconstructable description of a database URL
 * for logging. Deliberately never includes any substring of the hostname,
 * username, password, project ref, or the original URL — only coarse
 * categorical facts (see SafeUrlDescription) that are safe to print.
 */
export function describeDatabaseUrlSafely(rawUrl: string): SafeUrlDescription {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      parseable: false,
      scheme: null,
      hostCategory: null,
      port: null,
      database: null,
      hasCredentials: false,
      sslRequired: false,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  let hostCategory: SafeUrlDescription['hostCategory'] = 'other';
  if (
    SESSION_POOLER_HOST_PATTERN.test(hostname) ||
    DIRECT_SUPABASE_HOST_PATTERN.test(hostname) ||
    hostname.endsWith('.supabase.co') ||
    hostname.endsWith('.pooler.supabase.com')
  ) {
    hostCategory = SESSION_POOLER_HOST_PATTERN.test(hostname)
      ? 'supabase-session-pooler'
      : 'supabase-other';
  }

  return {
    parseable: true,
    scheme: parsed.protocol.replace(':', '') || null,
    hostCategory,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, '') || null,
    hasCredentials: Boolean(parsed.username && parsed.password),
    sslRequired: parsed.searchParams.get('sslmode') === 'require',
  };
}

export type ValidatedDatabaseUrl = {
  host: string;
  port: string;
};

/**
 * Minimal structural-only validation (scheme/host/credentials/db name
 * present), independent of production identity. Used only where identity
 * enforcement does not apply. Never returns anything reconstructable.
 */
export function validateDatabaseUrlStructure(
  rawUrl: string | undefined
): ValidatedDatabaseUrl {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('DATABASE_URL is required and was not provided.');
  }

  rejectCorruptedRawValue(rawUrl);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a syntactically valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgres:// or postgresql:// scheme, got "${parsed.protocol}".`
    );
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL is missing a host.');
  }

  if (!parsed.username || !parsed.password) {
    throw new Error('DATABASE_URL is missing credentials.');
  }

  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error('DATABASE_URL is missing a database name.');
  }

  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
  };
}

// ---------------------------------------------------------------------------
// Operator acknowledgement gates.
// ---------------------------------------------------------------------------

export function assertShaMatches(expectedSha: string, actualSha: string): void {
  const normalizedExpected = expectedSha.trim().toLowerCase();
  const normalizedActual = actualSha.trim().toLowerCase();

  if (!normalizedExpected) {
    throw new Error('Reviewed commit SHA input is required.');
  }

  if (normalizedExpected !== normalizedActual) {
    throw new Error(
      `Reviewed commit SHA "${expectedSha}" does not match checked-out main SHA "${actualSha}". Refusing to deploy.`
    );
  }
}

export function assertOperatorAcknowledgement(
  value: string,
  label: string
): void {
  if (value.trim().toLowerCase() !== 'yes') {
    throw new Error(
      `Operator acknowledgement "${label}" was not confirmed (expected "yes", got "${value}"). Refusing to deploy.`
    );
  }
}

export function parseNonNegativeInteger(
  rawValue: string,
  label: string
): number {
  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `${label} must be a non-negative integer, got "${rawValue}".`
    );
  }
  return Number.parseInt(trimmed, 10);
}

export function assertPendingCountMatches(
  reviewedCount: number,
  actualCount: number
): void {
  if (reviewedCount !== actualCount) {
    throw new Error(
      `Reviewed pending migration count (${reviewedCount}) does not match the actual pending count computed from exact version-set reconciliation (${actualCount}). Refusing to deploy.`
    );
  }
}

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function normalizePendingDigest(
  rawValue: string,
  label: string
): string {
  const trimmed = rawValue.trim().toLowerCase();
  if (!DIGEST_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} must be a 64-character lowercase hex SHA-256 digest, got "${rawValue}".`
    );
  }
  return trimmed;
}

export function assertPendingDigestMatches(
  reviewedDigest: string,
  actualDigest: string
): void {
  if (reviewedDigest !== actualDigest) {
    throw new Error(
      'Reviewed pending-migration-set digest does not match the actual digest computed from exact version-set reconciliation. The reviewed count may match by coincidence while the underlying version set differs. Refusing to deploy.'
    );
  }
}
