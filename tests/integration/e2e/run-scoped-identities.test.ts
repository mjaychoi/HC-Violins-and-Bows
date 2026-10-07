/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import {
  DEFAULT_E2E_ORG_ID,
  deriveE2EOrgId,
  deriveE2EOrgName,
  deriveE2EScopedEmail,
  getE2EAdminIdentity,
  getE2EMemberIdentity,
  getE2EOrgId,
  getE2EOrgName,
  getE2ERunScope,
  getE2ERunScopeKey,
  isRunScopedE2E,
  normalizeE2ERunScope,
  requiresRunScopedE2E,
  uuidV5,
} from '../../e2e/e2e-identities';

const UUID_V5_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[a-z0-9-]+@example\.test$/;

const runA = '18342901234-1-critical';
const runB = '18342905678-1-critical';

const localLegacyEnv = {
  E2E_TEST_EMAIL: 'local-admin@test.local',
  E2E_TEST_PASSWORD: 'local-admin-pw',
  E2E_TEST_MEMBER_EMAIL: 'local-member@test.local',
  E2E_TEST_MEMBER_PASSWORD: 'local-member-pw',
  E2E_TEST_ORG_ID: '11111111-2222-4333-8444-555555555555',
};

describe('run scope key', () => {
  it('is stable for the same raw scope', () => {
    expect(normalizeE2ERunScope(runA)).toBe(normalizeE2ERunScope(runA));
    expect(normalizeE2ERunScope(`  ${runA}  `)).toBe(
      normalizeE2ERunScope(runA)
    );
  });

  it('differs across runs, rerun attempts, and slots', () => {
    const keys = [
      runA,
      runB,
      '18342901234-2-critical',
      '18342901234-1-critical-a',
      '18342901234-1-critical-b',
    ].map(normalizeE2ERunScope);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hashes unsafe characters into a bounded hex key', () => {
    const unsafe = `../${'x'.repeat(200)}'; DROP TABLE organizations;-- <@>\n`;
    const key = normalizeE2ERunScope(unsafe);
    expect(key).toMatch(/^[0-9a-f]{12}$/);
    expect(key).not.toContain('DROP');
  });

  it('rejects empty and oversized scopes', () => {
    expect(() => normalizeE2ERunScope('')).toThrow(/non-empty/);
    expect(() => normalizeE2ERunScope('   ')).toThrow(/non-empty/);
    expect(() => normalizeE2ERunScope('x'.repeat(257))).toThrow(/at most/);
  });
});

describe('run-scoped emails', () => {
  const keyA = normalizeE2ERunScope(runA);
  const keyB = normalizeE2ERunScope(runB);

  it('separates admin and member, and run A and run B', () => {
    const emails = [
      deriveE2EScopedEmail(keyA, 'admin'),
      deriveE2EScopedEmail(keyA, 'member'),
      deriveE2EScopedEmail(keyB, 'admin'),
      deriveE2EScopedEmail(keyB, 'member'),
    ];
    expect(new Set(emails).size).toBe(4);
  });

  it('is a valid, non-deliverable, marker-carrying address', () => {
    const email = deriveE2EScopedEmail(keyA, 'admin');
    expect(email).toMatch(EMAIL_RE);
    expect(email).toBe(`hcve2e-${keyA}-admin@example.test`);
    expect(deriveE2EScopedEmail(keyA, 'admin')).toBe(email);
  });

  it('rejects malformed keys and labels', () => {
    expect(() => deriveE2EScopedEmail('not-a-key', 'admin')).toThrow(
      /malformed/
    );
    expect(() => deriveE2EScopedEmail(keyA, 'Admin@x')).toThrow(/malformed/);
  });
});

describe('run-scoped organization id', () => {
  const keyA = normalizeE2ERunScope(runA);
  const keyB = normalizeE2ERunScope(runB);

  it('implements RFC 4122 version 5 (published test vector)', () => {
    expect(
      uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('is a valid v5 UUID, stable per scope, distinct across scopes', () => {
    expect(deriveE2EOrgId(keyA)).toMatch(UUID_V5_RE);
    expect(deriveE2EOrgId(keyA)).toBe(deriveE2EOrgId(keyA));
    expect(deriveE2EOrgId(keyA)).not.toBe(deriveE2EOrgId(keyB));
  });

  it('never equals the default shared E2E org', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(deriveE2EOrgId(normalizeE2ERunScope(`run-${i}`))).not.toBe(
        DEFAULT_E2E_ORG_ID
      );
    }
  });

  it('derives distinct secondary orgs for future cross-tenant suites', () => {
    const primaryA = deriveE2EOrgId(keyA);
    const secondaryA = deriveE2EOrgId(keyA, 'secondary');
    const secondaryB = deriveE2EOrgId(keyB, 'secondary');
    expect(secondaryA).toMatch(UUID_V5_RE);
    expect(new Set([primaryA, secondaryA, secondaryB]).size).toBe(3);
    expect(deriveE2EOrgName(keyA, 'secondary')).toBe(
      `HC Violins E2E ${keyA} secondary`
    );
  });

  it('names the org with a diagnostic marker', () => {
    expect(deriveE2EOrgName(keyA)).toBe(`HC Violins E2E ${keyA}`);
  });
});

describe('mode selection', () => {
  it('keeps the existing E2E_TEST_* behaviour locally without a scope', () => {
    expect(requiresRunScopedE2E(localLegacyEnv)).toBe(false);
    expect(isRunScopedE2E(localLegacyEnv)).toBe(false);
    expect(getE2ERunScopeKey(localLegacyEnv)).toBeNull();
    expect(getE2EAdminIdentity(localLegacyEnv)).toEqual({
      email: 'local-admin@test.local',
      password: 'local-admin-pw',
      orgId: localLegacyEnv.E2E_TEST_ORG_ID,
      role: 'admin',
    });
    expect(getE2EMemberIdentity(localLegacyEnv)).toEqual({
      email: 'local-member@test.local',
      password: 'local-member-pw',
      orgId: localLegacyEnv.E2E_TEST_ORG_ID,
      role: 'member',
    });
  });

  it('keeps the historical defaults locally with no env at all', () => {
    expect(getE2EAdminIdentity({}).email).toBe('test@test.com');
    expect(getE2EMemberIdentity({}).email).toBe('e2e-member@test.com');
    expect(getE2EOrgId({})).toBe(DEFAULT_E2E_ORG_ID);
    expect(getE2EOrgName({})).toBe('HC Violins and Bows');
  });

  it('keeps a local critical run against a non-staging project legacy', () => {
    const env = { ...localLegacyEnv, PLAYWRIGHT_SUITE: 'critical' };
    expect(requiresRunScopedE2E(env)).toBe(false);
    expect(getE2EAdminIdentity(env).email).toBe('local-admin@test.local');
  });

  it.each([
    ['CI=true', { CI: 'true' }],
    [
      'critical suite against hosted staging',
      { PLAYWRIGHT_SUITE: 'critical', STAGING_SUPABASE_PROJECT_REF: 'stg' },
    ],
  ])('fails closed without E2E_RUN_SCOPE: %s', (_label, mode) => {
    const env = { ...localLegacyEnv, ...mode };
    expect(requiresRunScopedE2E(env)).toBe(true);
    for (const call of [
      () => getE2ERunScope(env),
      () => getE2EOrgId(env),
      () => getE2EAdminIdentity(env),
      () => getE2EMemberIdentity(env),
    ]) {
      expect(call).toThrow(/E2E_RUN_SCOPE is required/);
    }
    expect(() => getE2EOrgId({ ...env, E2E_RUN_SCOPE: '   ' })).toThrow(
      /E2E_RUN_SCOPE is required/
    );
  });

  it('uses scoped identities in CI and ignores the shared email/org', () => {
    const env = { ...localLegacyEnv, CI: 'true', E2E_RUN_SCOPE: runA };
    const key = normalizeE2ERunScope(runA);
    const admin = getE2EAdminIdentity(env);
    const member = getE2EMemberIdentity(env);

    expect(isRunScopedE2E(env)).toBe(true);
    expect(getE2ERunScopeKey(env)).toBe(key);
    expect(admin).toEqual({
      email: `hcve2e-${key}-admin@example.test`,
      password: 'local-admin-pw',
      orgId: deriveE2EOrgId(key),
      role: 'admin',
    });
    expect(member).toEqual({
      email: `hcve2e-${key}-member@example.test`,
      password: 'local-member-pw',
      orgId: deriveE2EOrgId(key),
      role: 'member',
    });
    expect(getE2EOrgId(env)).not.toBe(localLegacyEnv.E2E_TEST_ORG_ID);
    expect(getE2EOrgName(env)).toBe(`HC Violins E2E ${key}`);
  });
});

describe('ci.yml E2E job wiring', () => {
  const ci = fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/ci.yml'),
    'utf8'
  );
  const e2eJob = ci.slice(ci.indexOf('\n  e2e-tests:'));

  it('derives E2E_RUN_SCOPE per run and per attempt, not from the SHA', () => {
    expect(e2eJob).toMatch(
      /E2E_RUN_SCOPE:\s*\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/
    );
    expect(e2eJob).not.toMatch(/E2E_RUN_SCOPE:.*github\.sha/);
  });

  it('no longer maps the shared admin/member emails', () => {
    expect(e2eJob).not.toMatch(/E2E_TEST_EMAIL:/);
    expect(e2eJob).not.toMatch(/E2E_TEST_MEMBER_EMAIL:/);
  });

  it('runs scope-bound cleanup as an always() safety net', () => {
    expect(e2eJob).toMatch(
      /if: always\(\) && steps\.staging_allowlist\.outcome == 'success'\s+run: npx tsx tests\/e2e\/cleanup-run-scoped-e2e\.ts/
    );
  });

  it('keeps the hosted E2E mutex until concurrent isolation is proven', () => {
    expect(e2eJob).toMatch(
      /concurrency:\s+group: hc-hosted-staging-critical-e2e\s+cancel-in-progress: false/
    );
  });
});
