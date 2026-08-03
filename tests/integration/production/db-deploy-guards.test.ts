/** @jest-environment node */

import { createHash } from 'crypto';
import {
  assertOperatorAcknowledgement,
  assertPendingCountMatches,
  assertPendingDigestMatches,
  assertShaMatches,
  computePendingDigest,
  describeDatabaseUrlSafely,
  describeProductionEndpointForLog,
  normalizePendingDigest,
  parseLocalMigrationFilenames,
  parseNonNegativeInteger,
  parseRemoteVersions,
  reconcileMigrationVersions,
  summarizePendingVersions,
  validateDatabaseUrlStructure,
  validateProductionEndpoint,
} from '../../../scripts/production/db-deploy-guards';

// Synthetic, non-production placeholder values only — never real credentials.
const EXPECTED_REF = 'synthref00000000ref1';
const sessionPoolerUrl = (ref: string = EXPECTED_REF) =>
  `postgresql://postgres.${ref}:s3cr3t-pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const transactionPoolerUrl = (ref: string = EXPECTED_REF) =>
  `postgresql://postgres.${ref}:s3cr3t-pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`;
const directUrl = (ref: string = EXPECTED_REF) =>
  `postgresql://postgres:s3cr3t-pw@db.${ref}.supabase.co:5432/postgres?sslmode=require`;

function v(n: number): string {
  // Deterministic 14-digit synthetic version, e.g. 1 -> "00000000000001"
  return String(n).padStart(14, '0');
}

function localFile(n: number, slug = 'change'): string {
  return `${v(n)}_${slug}.sql`;
}

describe('parseLocalMigrationFilenames', () => {
  it('parses well-formed filenames and sorts canonically', () => {
    const result = parseLocalMigrationFilenames([
      localFile(3, 'third'),
      localFile(1, 'first'),
      localFile(2, 'second'),
    ]);
    expect(result.map(m => m.version)).toEqual([v(1), v(2), v(3)]);
  });

  it('ignores non-.sql files entirely', () => {
    const result = parseLocalMigrationFilenames([
      localFile(1),
      'README.md',
      '.DS_Store',
    ]);
    expect(result).toHaveLength(1);
  });

  it('rejects a malformed .sql filename instead of silently skipping it', () => {
    expect(() =>
      parseLocalMigrationFilenames([localFile(1), 'unified.sql'])
    ).toThrow(/malformed/i);
  });

  it('rejects a .sql filename with a non-14-digit prefix', () => {
    expect(() =>
      parseLocalMigrationFilenames(['2026_short_prefix.sql'])
    ).toThrow(/malformed/i);
  });

  it('rejects duplicate local versions', () => {
    expect(() =>
      parseLocalMigrationFilenames([
        localFile(1, 'first'),
        localFile(1, 'first_again'),
      ])
    ).toThrow(/duplicate/i);
  });
});

describe('parseRemoteVersions', () => {
  it('normalizes and sorts unique versions', () => {
    const result = parseRemoteVersions([v(2), ` ${v(1)} `, v(3)]);
    expect(result.uniqueVersions).toEqual([v(1), v(2), v(3)]);
    expect(result.duplicateVersions).toEqual([]);
  });

  it('reports duplicate remote versions without throwing', () => {
    const result = parseRemoteVersions([v(1), v(1), v(2)]);
    expect(result.duplicateVersions).toEqual([v(1)]);
  });

  it('rejects a malformed remote version', () => {
    expect(() => parseRemoteVersions([v(1), 'not-a-version'])).toThrow(
      /malformed/i
    );
  });
});

describe('reconcileMigrationVersions — set reconciliation (not count arithmetic)', () => {
  it('computes pending as an exact set difference for a realistic 124/70 interleaved shape', () => {
    const local = parseLocalMigrationFilenames(
      Array.from({ length: 124 }, (_, i) => localFile(i + 1))
    );
    // Remote has every 124th-ish version applied except 54 pending ones,
    // interleaved rather than a clean prefix/suffix split.
    const remote = local
      .map(m => m.version)
      .filter((_, index) => index % 124 < 70);
    const result = reconcileMigrationVersions(local, remote);

    expect(result.localVersionCount).toBe(124);
    expect(result.remoteUniqueVersionCount).toBe(70);
    expect(result.pendingMigrationCount).toBe(54);
    expect(result.remoteOnlyVersions).toEqual([]);
  });

  it('rejects same count but different pending set (would be silently wrong under count arithmetic)', () => {
    const local = parseLocalMigrationFilenames([
      localFile(1),
      localFile(2),
      localFile(3),
      localFile(4),
    ]);
    // Case A: versions 1,2 applied -> pending {3,4}
    const resultA = reconcileMigrationVersions(local, [v(1), v(2)]);
    // Case B: versions 2,3 applied -> pending {1,4}
    const resultB = reconcileMigrationVersions(local, [v(2), v(3)]);

    expect(resultA.pendingMigrationCount).toBe(resultB.pendingMigrationCount);
    expect(resultA.pendingVersions).not.toEqual(resultB.pendingVersions);
    expect(resultA.pendingDigest).not.toBe(resultB.pendingDigest);
  });

  it('rejects one remote-only version even alongside one local-missing version (net-zero count under old arithmetic)', () => {
    const local = parseLocalMigrationFilenames([localFile(1), localFile(2)]);
    // Remote is missing v(1) (pending) but has an extra v(99) not in local
    // (remote-only). Old `local count - applied count` = 2 - 2 = 0 pending,
    // silently wrong. Exact-set reconciliation must fail closed instead.
    expect(() => reconcileMigrationVersions(local, [v(2), v(99)])).toThrow(
      /remote-only|no corresponding local migration file/i
    );
  });

  it('rejects duplicate remote history', () => {
    const local = parseLocalMigrationFilenames([localFile(1), localFile(2)]);
    expect(() => reconcileMigrationVersions(local, [v(1), v(1), v(2)])).toThrow(
      /duplicate/i
    );
  });

  it('handles 21 interleaved pending versions correctly', () => {
    const local = parseLocalMigrationFilenames(
      Array.from({ length: 40 }, (_, i) => localFile(i + 1))
    );
    const remote = local
      .map(m => m.version)
      .filter((_, index) => index % 2 === 0); // every other version applied
    const result = reconcileMigrationVersions(local, remote);
    expect(result.pendingMigrationCount).toBe(20);

    // Now knock out one more remote entry to land on exactly 21 pending.
    const remoteMinusOne = remote.slice(1);
    const result21 = reconcileMigrationVersions(local, remoteMinusOne);
    expect(result21.pendingMigrationCount).toBe(21);
    expect(result21.remoteOnlyVersions).toEqual([]);
  });

  it('exposes latestApplied as informational metadata only', () => {
    const local = parseLocalMigrationFilenames([localFile(1), localFile(2)]);
    const result = reconcileMigrationVersions(local, [v(1)]);
    expect(result.latestApplied).toBe(v(1));
    // latestApplied must not influence pendingMigrationCount.
    expect(result.pendingMigrationCount).toBe(1);
  });
});

describe('computePendingDigest', () => {
  it('produces the same digest for reordered input', () => {
    const versions = [v(3), v(1), v(2)];
    const reordered = [v(2), v(3), v(1)];
    expect(computePendingDigest(versions)).toBe(
      computePendingDigest(reordered)
    );
  });

  it('produces a different digest when the set changes', () => {
    const a = computePendingDigest([v(1), v(2), v(3)]);
    const b = computePendingDigest([v(1), v(2), v(4)]);
    expect(a).not.toBe(b);
  });

  it('matches the documented stable representation (sorted, newline-joined, trailing newline, UTF-8)', () => {
    const versions = [v(2), v(1)];
    const expected = createHash('sha256')
      .update(`${v(1)}\n${v(2)}\n`, 'utf8')
      .digest('hex');
    expect(computePendingDigest(versions)).toBe(expected);
  });

  it('digests the empty string (not a bare newline) for zero pending versions', () => {
    const expected = createHash('sha256').update('', 'utf8').digest('hex');
    expect(computePendingDigest([])).toBe(expected);
  });
});

describe('summarizePendingVersions', () => {
  it('returns a bounded summary, never the full list', () => {
    const local = parseLocalMigrationFilenames(
      Array.from({ length: 10 }, (_, i) => localFile(i + 1))
    );
    const result = reconcileMigrationVersions(local, []);
    const summary = summarizePendingVersions(result);

    expect(summary.pendingMigrationCount).toBe(10);
    expect(summary.firstPendingVersion).toBe(v(1));
    expect(summary.lastPendingVersion).toBe(v(10));
    expect(summary.pendingDigest).toBe(result.pendingDigest);
    expect(summary).not.toHaveProperty('pendingVersions');
  });

  it('returns nulls for a fully converged (zero-pending) set', () => {
    const local = parseLocalMigrationFilenames([localFile(1)]);
    const result = reconcileMigrationVersions(local, [v(1)]);
    const summary = summarizePendingVersions(result);
    expect(summary.pendingMigrationCount).toBe(0);
    expect(summary.firstPendingVersion).toBeNull();
    expect(summary.lastPendingVersion).toBeNull();
  });
});

describe('validateProductionEndpoint — accepted category', () => {
  it('accepts the approved session-pooler URL', () => {
    const descriptor = validateProductionEndpoint(
      sessionPoolerUrl(),
      EXPECTED_REF
    );
    expect(descriptor).toEqual({
      endpointCategory: 'session-pooler',
      port: '5432',
      database: 'postgres',
      projectMatch: true,
      ssl: 'require',
    });
  });

  it('is case-insensitive on the expected project ref', () => {
    expect(() =>
      validateProductionEndpoint(sessionPoolerUrl(), EXPECTED_REF.toUpperCase())
    ).not.toThrow();
  });
});

describe('validateProductionEndpoint — rejected categories', () => {
  it('rejects the transaction-pooler port (6543)', () => {
    expect(() =>
      validateProductionEndpoint(transactionPoolerUrl(), EXPECTED_REF)
    ).toThrow(/transaction-pooler|session-pooler port/i);
  });

  it('rejects a direct (IPv6-only) DB endpoint', () => {
    expect(() => validateProductionEndpoint(directUrl(), EXPECTED_REF)).toThrow(
      /direct.*supabase|session-pooler endpoint/i
    );
  });

  it('rejects localhost', () => {
    const url = `postgresql://postgres.${EXPECTED_REF}:pw@localhost:5432/postgres?sslmode=require`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(
      /localhost/i
    );
  });

  it('rejects an arbitrary Postgres host', () => {
    const url = `postgresql://postgres.${EXPECTED_REF}:pw@my-own-postgres.example.com:5432/postgres?sslmode=require`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(
      /session-pooler endpoint/i
    );
  });

  it('rejects the staging project (valid endpoint shape, wrong ref)', () => {
    const stagingRef = 'stagingexample1234ab';
    expect(() =>
      validateProductionEndpoint(sessionPoolerUrl(stagingRef), EXPECTED_REF)
    ).toThrow(/project reference/i);
  });

  it('rejects a project-ref mismatch generally', () => {
    expect(() =>
      validateProductionEndpoint(
        sessionPoolerUrl('someotherref00000001'),
        EXPECTED_REF
      )
    ).toThrow(/project reference/i);
  });

  it('rejects a missing sslmode=require', () => {
    const url = `postgresql://postgres.${EXPECTED_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(/ssl/i);
  });

  it('rejects a missing database name', () => {
    const url = `postgresql://postgres.${EXPECTED_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/?sslmode=require`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(
      /database name/i
    );
  });

  it('rejects a wrong database name', () => {
    const url = `postgresql://postgres.${EXPECTED_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/other?sslmode=require`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(
      /database must be/i
    );
  });

  it('rejects missing credentials', () => {
    const url = `postgresql://aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
    expect(() => validateProductionEndpoint(url, EXPECTED_REF)).toThrow(
      /pooler project-scoped form|credentials/i
    );
  });

  it('rejects a quote-corrupted raw value', () => {
    const wrapped = `"${sessionPoolerUrl()}"`;
    expect(() => validateProductionEndpoint(wrapped, EXPECTED_REF)).toThrow(
      /quote/i
    );
  });

  it('rejects a newline-corrupted raw value', () => {
    const corrupted = `${sessionPoolerUrl()}\nDROP TABLE x;`;
    expect(() => validateProductionEndpoint(corrupted, EXPECTED_REF)).toThrow(
      /newline/i
    );
  });

  it('rejects when EXPECTED_SUPABASE_PROJECT_REF is not configured', () => {
    expect(() =>
      validateProductionEndpoint(sessionPoolerUrl(), undefined)
    ).toThrow(/EXPECTED_SUPABASE_PROJECT_REF/);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateProductionEndpoint(undefined, EXPECTED_REF)).toThrow(
      /required/i
    );
  });
});

describe('describeProductionEndpointForLog', () => {
  it('produces exactly the documented safe log form', () => {
    const descriptor = validateProductionEndpoint(
      sessionPoolerUrl(),
      EXPECTED_REF
    );
    expect(describeProductionEndpointForLog(descriptor)).toBe(
      'endpoint=session-pooler port=5432 database=postgres project_match=yes ssl=require'
    );
  });
});

describe('describeDatabaseUrlSafely (URL masking replacement)', () => {
  const forbidden = (output: string, ...values: string[]) => {
    const serialized = JSON.stringify(output);
    for (const value of values) {
      expect(serialized).not.toContain(value);
    }
  };

  it('never reconstructs a session-pooler URL host, ref, username, or password', () => {
    const ref = 'sessionpoolerref111';
    const url = sessionPoolerUrl(ref);
    const description = describeDatabaseUrlSafely(url);
    forbidden(
      JSON.stringify(description),
      ref,
      'aws-0-us-east-1.pooler.supabase.com',
      'postgres.' + ref,
      's3cr3t-pw',
      url
    );
    expect(description.hostCategory).toBe('supabase-session-pooler');
  });

  it('never reconstructs a direct URL host/ref even though the ref is embedded in the hostname', () => {
    const ref = 'directurlref1111111';
    const url = directUrl(ref);
    const description = describeDatabaseUrlSafely(url);
    forbidden(JSON.stringify(description), ref, `db.${ref}.supabase.co`, url);
  });

  it('never reconstructs a transaction-pooler URL', () => {
    const url = transactionPoolerUrl();
    const description = describeDatabaseUrlSafely(url);
    forbidden(JSON.stringify(description), EXPECTED_REF, url);
    expect(description.port).toBe('6543');
  });

  it('degrades safely for a malformed URL without throwing', () => {
    const description = describeDatabaseUrlSafely('not-a-url');
    expect(description.parseable).toBe(false);
    expect(description).not.toHaveProperty('host');
  });

  it('never reconstructs a password containing encoded special characters', () => {
    const specialPassword = 'p%40ss%2Fw%3Dord!';
    const url = `postgresql://postgres.${EXPECTED_REF}:${specialPassword}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
    const description = describeDatabaseUrlSafely(url);
    forbidden(
      JSON.stringify(description),
      specialPassword,
      decodeURIComponent(specialPassword),
      url
    );
    expect(description.hasCredentials).toBe(true);
  });
});

describe('validateDatabaseUrlStructure', () => {
  it('accepts a well-formed synthetic postgres URL', () => {
    const result = validateDatabaseUrlStructure(sessionPoolerUrl());
    expect(result.port).toBe('5432');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateDatabaseUrlStructure(undefined)).toThrow(/required/i);
    expect(() => validateDatabaseUrlStructure('')).toThrow(/required/i);
  });

  it('rejects a non-postgres scheme', () => {
    expect(() =>
      validateDatabaseUrlStructure('https://example.com/db')
    ).toThrow(/postgres/i);
  });

  it('rejects a URL missing credentials', () => {
    expect(() =>
      validateDatabaseUrlStructure('postgresql://example.com:5432/postgres')
    ).toThrow(/credentials/i);
  });

  it('rejects a URL missing a database name', () => {
    expect(() =>
      validateDatabaseUrlStructure('postgresql://user:pw@example.com:5432/')
    ).toThrow(/database name/i);
  });
});

describe('assertShaMatches', () => {
  const sha = 'abc123def456abc123def456abc123def456abc';

  it('allows a matching SHA (case-insensitive)', () => {
    expect(() => assertShaMatches(sha.toUpperCase(), sha)).not.toThrow();
  });

  it('stops on a mismatched SHA', () => {
    expect(() =>
      assertShaMatches('0000000000000000000000000000000000000', sha)
    ).toThrow(/does not match/i);
  });

  it('stops on an empty reviewed SHA', () => {
    expect(() => assertShaMatches('   ', sha)).toThrow(/required/i);
  });
});

describe('assertOperatorAcknowledgement', () => {
  it('allows "yes" (case-insensitive, trimmed)', () => {
    expect(() =>
      assertOperatorAcknowledgement(' Yes ', 'backup/PITR confirmation')
    ).not.toThrow();
  });

  it('stops on anything other than yes', () => {
    expect(() =>
      assertOperatorAcknowledgement('no', 'maintenance window approval')
    ).toThrow(/not confirmed/i);
    expect(() =>
      assertOperatorAcknowledgement('', 'maintenance window approval')
    ).toThrow(/not confirmed/i);
  });
});

describe('parseNonNegativeInteger', () => {
  it('parses a valid integer string', () => {
    expect(parseNonNegativeInteger('54', 'pending count')).toBe(54);
  });

  it('rejects non-numeric input', () => {
    expect(() =>
      parseNonNegativeInteger('fifty-four', 'pending count')
    ).toThrow(/non-negative integer/i);
    expect(() => parseNonNegativeInteger('-1', 'pending count')).toThrow(
      /non-negative integer/i
    );
  });
});

describe('assertPendingCountMatches', () => {
  it('allows equal counts', () => {
    expect(() => assertPendingCountMatches(54, 54)).not.toThrow();
  });

  it('stops on differing counts', () => {
    expect(() => assertPendingCountMatches(54, 55)).toThrow(/does not match/i);
  });
});

describe('normalizePendingDigest', () => {
  it('normalizes case and trims whitespace', () => {
    const digest = computePendingDigest([v(1)]);
    expect(normalizePendingDigest(` ${digest.toUpperCase()} `, 'digest')).toBe(
      digest
    );
  });

  it('rejects a non-hex or wrong-length value', () => {
    expect(() => normalizePendingDigest('not-a-digest', 'digest')).toThrow(
      /64-character/i
    );
    expect(() => normalizePendingDigest('abcd', 'digest')).toThrow(
      /64-character/i
    );
  });
});

describe('assertPendingDigestMatches', () => {
  it('allows an exact digest match', () => {
    const digest = computePendingDigest([v(1), v(2)]);
    expect(() => assertPendingDigestMatches(digest, digest)).not.toThrow();
  });

  it('stops on a digest mismatch even when the count happens to match', () => {
    const digestA = computePendingDigest([v(1), v(2)]);
    const digestB = computePendingDigest([v(3), v(4)]);
    expect(() => assertPendingDigestMatches(digestA, digestB)).toThrow(
      /does not match/i
    );
  });
});
