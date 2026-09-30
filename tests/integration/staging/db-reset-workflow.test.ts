/** @jest-environment node */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import type { Client, ClientConfig } from 'pg';
import { createDatabaseClientConfig } from '../../../scripts/production/database-client-config';
import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  type EnvMap,
} from '../../../scripts/staging/env-guard';
import {
  emitPreflightReport,
  readClientTransportVerification,
  runStagingResetPreflight,
  type PreflightReport,
} from '../../../scripts/staging/reset-preflight-probe';
import {
  assertExactMigrationEquality,
  assertPreflightProbeSignals,
  assertVerifyFullDatabaseUrl,
  buildStagingDbResetArgs,
  classifyResetOutcome,
  compareCanonicalMigrationSets,
  evaluatePreflightProbeSignals,
  evaluateResetDispatchGates,
  isClientTlsVerificationConfigured,
  prepareStagingDbReset,
  readCheckedOutCanonicalMigrations,
  ResetGateError,
  type ResetOutcomeInput,
} from '../../../scripts/staging/reset-gates';
import { executeStagingDbReset } from '../../../scripts/staging/run-staging-db-reset';
import { buildResetEvidence } from '../../../scripts/staging/write-reset-evidence';

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

  it('keeps a failed preflight from counting as an executed reset', () => {
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
    expect(
      classifyResetOutcome(
        passingOutcome({
          tlsVerified: false,
          resetExecuted: true,
        })
      )
    ).toBe('BLOCKED_SAFETY_GUARD');
  });
});

describe('pre-reset client TLS preflight', () => {
  const poolerUrl = `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  let caPath = '';
  let previousCaPath: string | undefined;
  let previousCaRequired: string | undefined;

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-preflight-ca-'));
    caPath = path.join(dir, 'ca.crt');
    fs.writeFileSync(caPath, PEM, { mode: 0o600 });
  });

  beforeEach(() => {
    previousCaPath = process.env.DATABASE_CA_CERT_PATH;
    previousCaRequired = process.env.DATABASE_CA_CERT_REQUIRED;
    process.env.DATABASE_CA_CERT_PATH = caPath;
    process.env.DATABASE_CA_CERT_REQUIRED = 'true';
  });

  afterEach(() => {
    if (previousCaPath === undefined) {
      delete process.env.DATABASE_CA_CERT_PATH;
    } else {
      process.env.DATABASE_CA_CERT_PATH = previousCaPath;
    }
    if (previousCaRequired === undefined) {
      delete process.env.DATABASE_CA_CERT_REQUIRED;
    } else {
      process.env.DATABASE_CA_CERT_REQUIRED = previousCaRequired;
    }
  });

  function verifiedEnv(): EnvMap {
    return {
      DATABASE_CA_CERT_PATH: caPath,
      DATABASE_CA_CERT_REQUIRED: 'true',
    };
  }

  function session(options: {
    selectOk?: unknown;
    selectThrows?: boolean;
    ssl?: boolean | 'absent' | 'throw';
    migrations?: number | 'throw';
    transport?: { encrypted: boolean; authorized: boolean } | null;
  }) {
    let connected = 0;
    const withClient = async <T>(
      _databaseUrl: string,
      fn: (client: Client) => Promise<T>
    ): Promise<T> => {
      connected += 1;
      const client = {
        query: async (sql: string) => {
          if (sql === 'SELECT 1 AS ok') {
            if (options.selectThrows) {
              throw new Error('select failed');
            }
            return { rows: [{ ok: options.selectOk ?? 1 }] };
          }
          if (sql.includes('pg_stat_ssl')) {
            if (options.ssl === 'throw') {
              throw new Error('pg_stat_ssl unavailable');
            }
            if (options.ssl === 'absent') {
              return { rows: [] };
            }
            return { rows: [{ ssl: options.ssl ?? false }] };
          }
          if (sql.includes('schema_migrations')) {
            if (options.migrations === 'throw') {
              throw new Error('schema_migrations unavailable');
            }
            return {
              rows: Array.from(
                { length: options.migrations ?? 0 },
                (_unused, index) => ({ version: String(index) })
              ),
            };
          }
          throw new Error('unexpected preflight query');
        },
        connection:
          options.transport === null
            ? undefined
            : {
                stream: options.transport ?? {
                  encrypted: true,
                  authorized: true,
                },
              },
      };
      return fn(client as unknown as Client);
    };
    return { connected: () => connected, withClient };
  }

  it('passes a verified client connection and SELECT 1 when pg_stat_ssl is false', async () => {
    const fake = session({ ssl: false, migrations: 2 });
    const report = await runStagingResetPreflight(verifiedEnv(), poolerUrl, {
      withClient: fake.withClient,
    });

    expect(report).toMatchObject({
      clientConnectionVerified: true,
      select1Passed: true,
      clientTlsVerificationConfigured: true,
      backendPgStatSsl: false,
      clientTransportEncrypted: true,
      clientTransportAuthorized: true,
      tlsVerified: true,
      preflightCause: null,
      preResetRemoteMigrationCount: 2,
    });
    expect(assertPreflightProbeSignals(report).tlsVerified).toBe(true);
    expect(fake.connected()).toBe(1);
  });

  it('passes when pg_stat_ssl is absent and does not require the pg socket internal', async () => {
    const fake = session({ ssl: 'absent', transport: null });
    const report = await runStagingResetPreflight(verifiedEnv(), poolerUrl, {
      withClient: fake.withClient,
    });

    expect(report.backendPgStatSsl).toBeNull();
    expect(report.clientTransportEncrypted).toBeNull();
    expect(report.clientTransportAuthorized).toBeNull();
    expect(report.tlsVerified).toBe(true);
    expect(report.preflightCause).toBeNull();
    expect(readClientTransportVerification({} as Client)).toEqual({
      encrypted: null,
      authorized: null,
    });
  });

  it('records transport booleans without letting them replace the TLS config gate', () => {
    expect(
      readClientTransportVerification({
        connection: { stream: { encrypted: true, authorized: true } },
      } as unknown as Client)
    ).toEqual({ encrypted: true, authorized: true });
    expect(
      evaluatePreflightProbeSignals({
        clientConnectionVerified: false,
        select1Passed: false,
        clientTlsVerificationConfigured: false,
        backendPgStatSsl: true,
      })
    ).toMatchObject({
      tlsVerified: false,
      preflightCause: 'BLOCKED_TLS_CONFIGURATION',
    });
  });

  it('blocks reset when client.connect fails', async () => {
    let connected = 0;
    await expect(
      runStagingResetPreflight(verifiedEnv(), poolerUrl, {
        withClient: async () => {
          connected += 1;
          throw new Error('connect ECONNREFUSED');
        },
      })
    ).rejects.toMatchObject({
      classification: 'BLOCKED_SAFETY_GUARD',
      preflightCause: 'BLOCKED_CONNECTIVITY',
      evidence: {
        clientConnectionVerified: false,
        select1Passed: false,
        clientTlsVerificationConfigured: true,
        tlsVerified: false,
        preflightCause: 'BLOCKED_CONNECTIVITY',
      },
    });
    expect(connected).toBe(1);
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

  it('blocks reset when SELECT 1 fails', async () => {
    const wrongValue = session({ selectOk: 0, ssl: true });
    await expect(
      runStagingResetPreflight(verifiedEnv(), poolerUrl, {
        withClient: wrongValue.withClient,
      })
    ).rejects.toMatchObject({
      preflightCause: 'BLOCKED_SELECT1',
      evidence: {
        clientConnectionVerified: true,
        select1Passed: false,
        backendPgStatSsl: null,
        tlsVerified: false,
      },
    });

    const thrown = session({ selectThrows: true, ssl: true });
    await expect(
      runStagingResetPreflight(verifiedEnv(), poolerUrl, {
        withClient: thrown.withClient,
      })
    ).rejects.toMatchObject({ preflightCause: 'BLOCKED_SELECT1' });
  });

  it('blocks reset when the trusted CA is missing and does not connect', async () => {
    delete process.env.DATABASE_CA_CERT_PATH;
    let connected = 0;
    await expect(
      runStagingResetPreflight(
        { DATABASE_CA_CERT_REQUIRED: 'true' },
        poolerUrl,
        {
          withClient: async () => {
            connected += 1;
            throw new Error('should not connect');
          },
        }
      )
    ).rejects.toMatchObject({
      preflightCause: 'BLOCKED_TLS_CONFIGURATION',
      evidence: {
        clientConnectionVerified: false,
        clientTlsVerificationConfigured: false,
        tlsVerified: false,
      },
    });
    expect(connected).toBe(0);
    expect(() => createDatabaseClientConfig(poolerUrl)).toThrow(
      /DATABASE_CA_CERT_PATH is required/
    );
  });

  it('refuses to disable TLS verification even if pg_stat_ssl would be true', async () => {
    const weakened: ClientConfig = {
      connectionString: poolerUrl,
      ssl: {
        ca: PEM,
        rejectUnauthorized: false,
        checkServerIdentity: tls.checkServerIdentity,
      },
    };
    let connected = 0;
    await expect(
      runStagingResetPreflight(verifiedEnv(), poolerUrl, {
        createConfig: () => weakened,
        withClient: async () => {
          connected += 1;
          throw new Error('should not connect');
        },
      })
    ).rejects.toMatchObject({ preflightCause: 'BLOCKED_TLS_CONFIGURATION' });
    expect(connected).toBe(0);
    expect(isClientTlsVerificationConfigured(verifiedEnv(), weakened)).toBe(
      false
    );
    expect(
      isClientTlsVerificationConfigured(verifiedEnv(), {
        connectionString: poolerUrl,
        ssl: {
          ca: PEM,
          rejectUnauthorized: true,
        },
      })
    ).toBe(false);
    expect(
      isClientTlsVerificationConfigured(
        { DATABASE_CA_CERT_REQUIRED: 'false' },
        createDatabaseClientConfig(poolerUrl)
      )
    ).toBe(false);
    expect(() =>
      assertVerifyFullDatabaseUrl(`${poolerUrl}?sslmode=disable`)
    ).toThrow(/verify-full/);
    expect(() =>
      assertVerifyFullDatabaseUrl(
        `${poolerUrl}?sslmode=no-verify&sslrootcert=${caPath}`
      )
    ).toThrow(/verify-full/);
    expect(() =>
      assertPreflightProbeSignals({
        clientConnectionVerified: true,
        select1Passed: true,
        clientTlsVerificationConfigured: false,
        backendPgStatSsl: true,
      })
    ).toThrow(/BLOCKED_TLS_CONFIGURATION/);
  });

  it('does not let pg_stat_ssl independently set tlsVerified', () => {
    const decision = evaluatePreflightProbeSignals({
      clientConnectionVerified: true,
      select1Passed: true,
      clientTlsVerificationConfigured: true,
      backendPgStatSsl: false,
    });
    expect(decision.tlsVerified).toBe(true);

    const backendOnly = evaluatePreflightProbeSignals({
      clientConnectionVerified: false,
      select1Passed: false,
      clientTlsVerificationConfigured: false,
      backendPgStatSsl: true,
    });
    expect(backendOnly.tlsVerified).toBe(false);
    expect(backendOnly.preflightCause).toBe('BLOCKED_TLS_CONFIGURATION');
    expect(JSON.stringify(backendOnly)).not.toMatch(/tlsVerified":true/);
  });

  it('records the specific preflight cause without secrets', () => {
    const evidence = buildResetEvidence({
      RESET_FINAL_CLASSIFICATION: 'BLOCKED_SAFETY_GUARD',
      RESET_TARGET_VERIFIED: 'true',
      RESET_PRODUCTION_REJECTED: 'true',
      RESET_EXPLICIT_CONFIRMATION: 'true',
      RESET_CLIENT_CONNECTION_VERIFIED: 'true',
      RESET_SELECT1_PASSED: 'false',
      RESET_CLIENT_TLS_VERIFICATION_CONFIGURED: 'true',
      RESET_BACKEND_PG_STAT_SSL: 'false',
      RESET_PREFLIGHT_CAUSE: 'BLOCKED_SELECT1',
      RESET_TLS_VERIFIED: 'false',
      RESET_EXECUTED: 'false',
    });
    expect(evidence).toMatchObject({
      clientConnectionVerified: true,
      select1Passed: false,
      clientTlsVerificationConfigured: true,
      backendPgStatSsl: false,
      preflightCause: 'BLOCKED_SELECT1',
      tlsVerified: false,
      resetExecuted: false,
      finalClassification: 'BLOCKED_SAFETY_GUARD',
    });

    const passedDespiteBackendSsl = buildResetEvidence({
      RESET_FINAL_CLASSIFICATION: 'RESET_EXECUTED_PASS',
      RESET_CLIENT_CONNECTION_VERIFIED: 'true',
      RESET_SELECT1_PASSED: 'true',
      RESET_CLIENT_TLS_VERIFICATION_CONFIGURED: 'true',
      RESET_BACKEND_PG_STAT_SSL: 'false',
      RESET_TLS_VERIFIED: 'true',
      RESET_EXECUTED: 'true',
      RESET_POSTFLIGHT_OUTCOME: 'success',
      RESET_POSTFLIGHT_PASSED: 'true',
      RESET_OBJECTS_OUTCOME: 'success',
      RESET_SQL_AUDITS_OUTCOME: 'success',
    });
    expect(passedDespiteBackendSsl.tlsVerified).toBe(true);
    expect(passedDespiteBackendSsl.backendPgStatSsl).toBe(false);
    expect(passedDespiteBackendSsl.preflightCause).toBeNull();
    expect(JSON.stringify(evidence)).not.toContain('postgresql://');
    expect(JSON.stringify(evidence)).not.toContain('BEGIN CERTIFICATE');
    expect(JSON.stringify(evidence)).not.toContain(PEM);
  });

  it('emits distinct preflight outputs that still gate reset on client TLS', () => {
    const outputPath = path.join(
      os.tmpdir(),
      `preflight-output-${process.pid}.txt`
    );
    fs.writeFileSync(outputPath, '');
    const previousOutput = process.env.GITHUB_OUTPUT;
    process.env.GITHUB_OUTPUT = outputPath;
    const logged: string[] = [];
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(chunk => {
        logged.push(String(chunk));
        return true;
      });
    const report: PreflightReport = {
      clientConnectionVerified: false,
      select1Passed: false,
      clientTlsVerificationConfigured: false,
      backendPgStatSsl: true,
      clientTransportEncrypted: null,
      clientTransportAuthorized: null,
      tlsVerified: false,
      preflightCause: 'BLOCKED_TLS_CONFIGURATION',
      preResetRemoteMigrationCount: null,
    };
    try {
      emitPreflightReport(report);
    } finally {
      stdout.mockRestore();
      if (previousOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
      } else {
        process.env.GITHUB_OUTPUT = previousOutput;
      }
    }

    const output = fs.readFileSync(outputPath, 'utf8');
    expect(output).toContain('tls_verified=false');
    expect(output).toContain('client_connection_verified=false');
    expect(output).toContain('select1_passed=false');
    expect(output).toContain('client_tls_verification_configured=false');
    expect(output).toContain('backend_pg_stat_ssl=true');
    expect(output).toContain('preflight_cause=BLOCKED_TLS_CONFIGURATION');
    expect(output).not.toContain('postgresql://');
    expect(output).not.toContain('BEGIN CERTIFICATE');
    const stdoutText = logged.join('');
    expect(stdoutText).toContain('"backendPgStatSsl":true');
    expect(stdoutText).toContain('"tlsVerified":false');
    expect(stdoutText).toContain(
      '"preflightCause":"BLOCKED_TLS_CONFIGURATION"'
    );
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
    expect(workflow).toContain(
      'steps.probe.outputs.client_connection_verified'
    );
    expect(workflow).toContain('steps.probe.outputs.select1_passed');
    expect(workflow).toContain(
      'steps.probe.outputs.client_tls_verification_configured'
    );
    expect(workflow).toContain('steps.probe.outputs.backend_pg_stat_ssl');
    expect(workflow).toContain('steps.probe.outputs.preflight_cause');
    expect(preflight).toContain('isClientTlsVerificationConfigured');
    expect(preflight).toContain('backendPgStatSsl');
    expect(preflight).not.toContain('ssl=true are required');
    expect(workflow).toContain('verify-migration-set.ts');
    expect(workflow).toContain('postflight-catalog.ts');
    expect(workflow).toContain('verify-reset-objects.ts');
    expect(workflow).toContain('run-pr58-audits.sh');
    expect(workflow).toContain('npm run check:migrations');
    expect(workflow).not.toContain('e2c7f3b');
  });
});
