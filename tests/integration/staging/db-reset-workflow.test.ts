/** @jest-environment node */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  type EnvMap,
} from '../../../scripts/staging/env-guard';
import {
  assertExactMigrationEquality,
  assertPreflightProbeSignals,
  buildStagingDbResetArgs,
  classifyResetOutcome,
  compareCanonicalMigrationSets,
  evaluateResetDispatchGates,
  prepareStagingDbReset,
  readCheckedOutCanonicalMigrations,
  ResetGateError,
  type ResetOutcomeInput,
} from '../../../scripts/staging/reset-gates';
import { executeStagingDbReset } from '../../../scripts/staging/run-staging-db-reset';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';
const otherRef = 'otherstaging9999';

const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature';

const PEM =
  '-----BEGIN CERTIFICATE-----\nCERTIFICATEBODYMUSTNOTBELOGGED\n-----END CERTIFICATE-----\n';

function hostedEnv(overrides: EnvMap = {}): EnvMap {
  return {
    STAGING_SUPABASE_PROJECT_REF: stagingRef,
    [PRODUCTION_SUPABASE_PROJECT_REF_ENV]: productionRef,
    STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    STAGING_SUPABASE_ANON_KEY: 'anon-key',
    STAGING_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    STAGING_DATABASE_URL: `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    RESET_STAGING_CONFIRMED: 'yes',
    EXPECTED_STAGING_PROJECT_REF: stagingRef,
    ...overrides,
  };
}

function passingOutcome(
  overrides: Partial<ResetOutcomeInput> = {}
): ResetOutcomeInput {
  return {
    confirmClassification: 'eligible',
    guardOutcome: 'success',
    guardClassification: '',
    probeOutcome: 'success',
    tlsVerified: true,
    resetExecuted: true,
    resetCommandOutcome: 'success',
    equalityOutcome: 'success',
    verifySetOutcome: 'success',
    postflightOutcome: 'success',
    postflightPassed: true,
    objectsOutcome: 'success',
    sqlAuditsOutcome: 'success',
    remoteOnlyAfter: 0,
    localOnlyAfter: 0,
    remoteCountAfter: 128,
    localCount: 128,
    ...overrides,
  };
}

describe('hosted staging reset dispatch gates', () => {
  it('blocks a missing confirmation before any other gate', () => {
    const decision = evaluateResetDispatchGates({
      resetStagingConfirmed: 'no',
      expectedStagingProjectRef: stagingRef,
      configuredStagingProjectRef: stagingRef,
    });
    expect(decision.eligible).toBe(false);
    if (!decision.eligible) {
      expect(decision.classification).toBe('BLOCKED_MISSING_CONFIRMATION');
    }

    try {
      prepareStagingDbReset(
        hostedEnv({
          RESET_STAGING_CONFIRMED: 'no',
          STAGING_DATABASE_URL: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
        })
      );
      throw new Error('missing confirmation was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ResetGateError);
      expect((error as ResetGateError).classification).toBe(
        'BLOCKED_MISSING_CONFIRMATION'
      );
    }
  });

  it('blocks a wrong expected project ref', () => {
    const decision = evaluateResetDispatchGates({
      resetStagingConfirmed: 'yes',
      expectedStagingProjectRef: otherRef,
      configuredStagingProjectRef: stagingRef,
    });
    expect(decision).toMatchObject({
      eligible: false,
      classification: 'BLOCKED_TARGET_MISMATCH',
    });
  });

  it('accepts only the literal yes when the expected ref matches', () => {
    expect(
      evaluateResetDispatchGates({
        resetStagingConfirmed: 'YES',
        expectedStagingProjectRef: stagingRef,
        configuredStagingProjectRef: stagingRef,
      }).eligible
    ).toBe(false);
    expect(
      evaluateResetDispatchGates({
        resetStagingConfirmed: 'yes',
        expectedStagingProjectRef: stagingRef,
        configuredStagingProjectRef: stagingRef,
      })
    ).toEqual({ eligible: true, approvedProjectRef: stagingRef });
  });
});

describe('hosted staging reset safety gates', () => {
  let caPath = '';

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-reset-ca-'));
    caPath = path.join(dir, 'ca.crt');
    fs.writeFileSync(caPath, PEM, { mode: 0o600 });
  });

  function prepareReady(overrides: EnvMap = {}) {
    return prepareStagingDbReset(
      hostedEnv({
        DATABASE_CA_CERT_PATH: caPath,
        DATABASE_CA_CERT_REQUIRED: 'true',
        ...overrides,
      })
    );
  }

  it('blocks a production database target', () => {
    expect(() =>
      prepareReady({
        STAGING_DATABASE_URL: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      })
    ).toThrow(ResetGateError);
    try {
      prepareReady({
        STAGING_SUPABASE_URL: `https://${productionRef}.supabase.co`,
        STAGING_DATABASE_URL: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      });
      throw new Error('production target was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ResetGateError);
      expect((error as ResetGateError).classification).toBe(
        'BLOCKED_SAFETY_GUARD'
      );
    }
  });

  it('blocks a localhost target', () => {
    try {
      prepareReady({
        STAGING_SUPABASE_URL: 'http://127.0.0.1:54321',
        STAGING_DATABASE_URL:
          'postgresql://postgres:password@127.0.0.1:54322/postgres',
      });
      throw new Error('localhost target was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ResetGateError);
      expect((error as ResetGateError).classification).toBe(
        'BLOCKED_SAFETY_GUARD'
      );
    }
  });

  it('blocks a staging URL and database ref mismatch', () => {
    try {
      prepareReady({
        STAGING_DATABASE_URL: `postgresql://postgres.${otherRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      });
      throw new Error('mismatched database ref was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ResetGateError);
      expect((error as ResetGateError).classification).toBe(
        'BLOCKED_TARGET_MISMATCH'
      );
    }
  });

  it('builds a verify-full reset command from the verified staging URL only', () => {
    const prepared = prepareReady({
      LINKED_PROJECT_REF: productionRef,
    });
    expect(prepared.args).toEqual([
      'db',
      'reset',
      '--db-url',
      prepared.databaseUrl,
      '--no-seed',
      '--yes',
    ]);
    const tls = new URL(prepared.databaseUrl).searchParams;
    expect(tls.get('sslmode')).toBe('verify-full');
    expect(tls.get('sslrootcert')).toBe(caPath);
    expect(prepared.databaseUrl).toContain(stagingRef);
    expect(prepared.databaseUrl.toLowerCase()).not.toContain(
      'sslmode=no-verify'
    );
    expect(prepared.databaseUrl).not.toContain(productionRef);
    expect(prepared.args).not.toContain('--linked');
    expect(prepared.args).not.toContain('--local');
    expect(prepared.args).not.toContain('link');
  });

  it('does not execute the reset command before confirmation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-reset-root-'));
    const linkedDir = path.join(root, 'supabase', '.temp');
    fs.mkdirSync(linkedDir, { recursive: true });
    const linkedFile = path.join(linkedDir, 'project-ref');
    fs.writeFileSync(linkedFile, productionRef);
    let spawned = 0;

    expect(() =>
      executeStagingDbReset(
        hostedEnv({
          RESET_STAGING_CONFIRMED: 'no',
          DATABASE_CA_CERT_PATH: caPath,
          DATABASE_CA_CERT_REQUIRED: 'true',
        }),
        {
          repoRoot: root,
          spawn: () => {
            spawned += 1;
            return { status: 0 };
          },
        }
      )
    ).toThrow(ResetGateError);

    expect(spawned).toBe(0);
    expect(fs.readFileSync(linkedFile, 'utf8')).toBe(productionRef);
  });

  it('ignores linked project metadata when the reset is allowed to run', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-reset-root-'));
    const linkedDir = path.join(root, 'supabase', '.temp');
    fs.mkdirSync(linkedDir, { recursive: true });
    fs.writeFileSync(path.join(linkedDir, 'project-ref'), productionRef);
    fs.writeFileSync(
      path.join(linkedDir, 'linked-project.json'),
      JSON.stringify({ ref: productionRef })
    );
    const spawned: string[][] = [];

    executeStagingDbReset(
      hostedEnv({
        DATABASE_CA_CERT_PATH: caPath,
        DATABASE_CA_CERT_REQUIRED: 'true',
        SUPABASE_ACCESS_TOKEN: 'must-not-be-required',
      }),
      {
        repoRoot: root,
        spawn: (_command, args) => {
          spawned.push([...args]);
          return { status: 0 };
        },
      }
    );

    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.slice(0, 3)).toEqual(['db', 'reset', '--db-url']);
    expect(spawned[0]?.slice(-2)).toEqual(['--no-seed', '--yes']);
    expect(spawned[0]?.join(' ')).not.toContain(productionRef);
    expect(spawned[0]).not.toContain('--linked');
    expect(fs.existsSync(path.join(linkedDir, 'project-ref'))).toBe(false);
  });
});

describe('post-reset migration equality', () => {
  it('requires remote-only, local-only, and both counts to match', () => {
    expect(compareCanonicalMigrationSets(['1', '2'], ['1', '2'])).toMatchObject(
      {
        exact: true,
        remoteOnlyCount: 0,
        localOnlyCount: 0,
        localMigrationCount: 2,
        remoteMigrationCount: 2,
      }
    );
    const drifted = compareCanonicalMigrationSets(['1', '2'], ['1', '9']);
    expect(drifted.exact).toBe(false);
    try {
      assertExactMigrationEquality(drifted);
      throw new Error('drifted migration set was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ResetGateError);
      expect((error as ResetGateError).classification).toBe(
        'RESET_FAILED_POSTFLIGHT'
      );
    }
    expect(
      classifyResetOutcome(
        passingOutcome({
          remoteOnlyAfter: 1,
          remoteCountAfter: 2,
          localCount: 2,
        })
      )
    ).toBe('RESET_FAILED_POSTFLIGHT');
    expect(
      classifyResetOutcome(
        passingOutcome({
          localOnlyAfter: 1,
          remoteCountAfter: 1,
          localCount: 2,
        })
      )
    ).toBe('RESET_FAILED_POSTFLIGHT');
    expect(classifyResetOutcome(passingOutcome())).toBe('RESET_EXECUTED_PASS');
  });

  it('derives the canonical inventory from the checked-out tree', () => {
    const inventory = readCheckedOutCanonicalMigrations();
    const filenames = fs
      .readdirSync(path.join(process.cwd(), 'supabase', 'migrations'))
      .filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    expect(inventory.migrationCount).toBe(filenames.length);
    expect(inventory.firstMigration).toBe(filenames[0]);
    expect(inventory.lastMigration).toBe(filenames.at(-1));
    expect(inventory.migrationCount).toBeGreaterThan(0);
  });

  it('treats a failed connectivity signal as a safety block', () => {
    expect(() =>
      assertPreflightProbeSignals({ selectOk: 1, ssl: false })
    ).toThrow(/TLS/);
    expect(
      classifyResetOutcome(
        passingOutcome({
          probeOutcome: 'failure',
          tlsVerified: false,
          resetExecuted: false,
          resetCommandOutcome: 'skipped',
        })
      )
    ).toBe('BLOCKED_SAFETY_GUARD');
  });
});

describe('hosted staging reset workflow contract', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/hosted-staging-db-reset.yml'),
    'utf8'
  );
  const runner = fs.readFileSync(
    path.join(process.cwd(), 'scripts/staging/run-staging-db-reset.ts'),
    'utf8'
  );
  const preflight = fs.readFileSync(
    path.join(process.cwd(), 'scripts/staging/reset-preflight-probe.ts'),
    'utf8'
  );

  it('is manual only', () => {
    const trigger = workflow.slice(0, workflow.indexOf('jobs:'));
    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).toContain('reset_staging_confirmed:');
    expect(trigger).toContain('expected_staging_project_ref:');
    expect(trigger).not.toMatch(/\n\s*push:/);
    expect(trigger).not.toMatch(/\n\s*pull_request:/);
    expect(trigger).not.toMatch(/\n\s*schedule:/);
    expect(trigger).not.toMatch(/workflow_call/);
    expect(trigger).not.toMatch(/workflow_run/);
  });

  it('checks out main and never uses linked project metadata or an access token', () => {
    expect(workflow).toContain('ref: main');
    expect(workflow).not.toContain('SUPABASE_ACCESS_TOKEN');
    expect(workflow).not.toMatch(/supabase\s+link\b/);
    expect(workflow).not.toContain('--linked');
    expect(workflow).not.toContain('project-ref');
    expect(workflow).not.toContain('secrets.DATABASE_URL');
    expect(workflow).toContain('secrets.STAGING_DATABASE_URL');
    expect(workflow).toContain('vars.STAGING_SUPABASE_PROJECT_REF');
    expect(workflow).toContain('vars.PRODUCTION_SUPABASE_PROJECT_REF');
    expect(runner).not.toMatch(/supabase\s+link\b/);
    expect(runner).not.toContain('--linked');
    expect(runner).not.toContain('readFileSync');
    expect(runner).toContain('delete childEnv.SUPABASE_ACCESS_TOKEN');
    expect(runner).toContain('isolateLinkedProjectMetadata');
    expect(preflight).not.toContain('reconcileMigrationVersions');
  });

  it('keeps certificate verification enabled and resets only after every gate', () => {
    expect(workflow).not.toContain('sslmode=no-verify');
    expect(workflow).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(workflow).not.toContain('rejectUnauthorized');
    expect(workflow).toContain('install-database-ca.sh');
    expect(workflow).toContain('version: 2.111.0');
    expect(buildStagingDbResetArgs('postgresql://example').slice(0, 3)).toEqual(
      ['db', 'reset', '--db-url']
    );

    const confirmIdx = workflow.indexOf('assert-reset-gates.ts confirm');
    const guardIdx = workflow.indexOf('assert-reset-gates.ts guard');
    const caIdx = workflow.indexOf('install-database-ca.sh');
    const probeIdx = workflow.indexOf('reset-preflight-probe.ts');
    const resetIdx = workflow.indexOf('run-staging-db-reset.ts');
    const equalityIdx = workflow.indexOf('assert-reset-migration-equality.ts');
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(confirmIdx);
    expect(caIdx).toBeGreaterThan(guardIdx);
    expect(probeIdx).toBeGreaterThan(caIdx);
    expect(resetIdx).toBeGreaterThan(probeIdx);
    expect(equalityIdx).toBeGreaterThan(resetIdx);

    const resetStep = workflow.slice(
      workflow.lastIndexOf('- name: Reset hosted staging database'),
      resetIdx
    );
    expect(resetStep).toContain('success()');
    expect(resetStep).toContain("steps.confirm.outputs.eligible == 'true'");
    expect(resetStep).toContain(
      "steps.guard.outputs.target_verified == 'true'"
    );
    expect(resetStep).toContain("steps.probe.outputs.tls_verified == 'true'");
    expect(workflow).toContain('verify-migration-set.ts');
    expect(workflow).toContain('postflight-catalog.ts');
    expect(workflow).toContain('verify-reset-objects.ts');
    expect(workflow).toContain('run-pr58-audits.sh');
    expect(workflow).toContain('npm run check:migrations');
    expect(workflow).not.toContain('e2c7f3b');
  });
});
