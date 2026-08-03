/**
 * Pure, secret-safe guard functions for the production migration deployment
 * workflow (.github/workflows/production-db-deploy.yml).
 *
 * These functions never read environment variables directly and never
 * return or log credentials, passwords, or full connection strings.
 */

export function maskDatabaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return '(unparseable)';
  }

  const protocol = parsed.protocol.replace(':', '');
  const host = parsed.hostname || '(unknown-host)';
  const port = parsed.port || '5432';
  const dbName = parsed.pathname.replace(/^\//, '') || '(unknown-db)';
  return `${protocol}://***:***@${host}:${port}/${dbName}`;
}

export type ValidatedDatabaseUrl = {
  host: string;
  port: string;
  masked: string;
};

export function validateDatabaseUrlStructure(
  rawUrl: string | undefined
): ValidatedDatabaseUrl {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('DATABASE_URL is required and was not provided.');
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
    masked: maskDatabaseUrl(rawUrl),
  };
}

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
      `Reviewed pending migration count (${reviewedCount}) does not match the actual pending count computed from the migration-history read (${actualCount}). Refusing to deploy.`
    );
  }
}

export function computePendingCount(
  totalLocalMigrations: number,
  appliedMigrationCount: number
): number {
  const pending = totalLocalMigrations - appliedMigrationCount;
  if (pending < 0) {
    throw new Error(
      `Applied migration count (${appliedMigrationCount}) exceeds local migration count (${totalLocalMigrations}); migration-history read looks inconsistent.`
    );
  }
  return pending;
}
