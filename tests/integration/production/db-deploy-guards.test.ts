/** @jest-environment node */

import {
  assertOperatorAcknowledgement,
  assertPendingCountMatches,
  assertShaMatches,
  computePendingCount,
  maskDatabaseUrl,
  parseNonNegativeInteger,
  validateDatabaseUrlStructure,
} from '../../../scripts/production/db-deploy-guards';

// Synthetic, non-production placeholder values only — never real credentials.
const syntheticUrl =
  'postgresql://postgres.synthetic-ref-example:s3cr3t-pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

describe('maskDatabaseUrl', () => {
  it('never includes the username or password in the masked output', () => {
    const masked = maskDatabaseUrl(syntheticUrl);
    expect(masked).not.toContain('postgres.synthetic-ref-example');
    expect(masked).not.toContain('s3cr3t-pw');
    expect(masked).toBe(
      'postgresql://***:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
    );
  });

  it('degrades safely for unparseable input without throwing', () => {
    expect(maskDatabaseUrl('not-a-url')).toBe('(unparseable)');
  });
});

describe('validateDatabaseUrlStructure', () => {
  it('accepts a well-formed synthetic postgres URL', () => {
    const result = validateDatabaseUrlStructure(syntheticUrl);
    expect(result.host).toBe('aws-0-us-east-1.pooler.supabase.com');
    expect(result.port).toBe('6543');
    expect(result.masked).not.toContain('s3cr3t-pw');
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

describe('computePendingCount', () => {
  it('computes the difference between local and applied counts', () => {
    expect(computePendingCount(124, 70)).toBe(54);
  });

  it('stops when applied exceeds local (inconsistent history read)', () => {
    expect(() => computePendingCount(124, 200)).toThrow(/inconsistent/i);
  });
});
