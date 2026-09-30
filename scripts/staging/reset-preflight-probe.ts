#!/usr/bin/env tsx
/**
 * Pre-reset connectivity probe. Informational migration count only.
 * Does not reconcile remote history and does not mutate.
 *
 * TLS proof is the Node client path from createDatabaseClientConfig:
 * required trusted CA, rejectUnauthorized, hostname verification, a
 * successful connect, a read-only transaction, and SELECT 1.
 *
 * pg_stat_ssl is recorded as backendPgStatSsl. It observes the Postgres
 * backend, not the runner → Supabase pooler TLS session, and it is not a
 * reset gate.
 *
 * Stdout is one JSON document. The database URL, credentials, and CA PEM
 * are never printed.
 */
import { pathToFileURL } from 'url';
import fs from 'fs';
import type { Client, ClientConfig } from 'pg';
import { createDatabaseClientConfig } from '../production/database-client-config';
import type { EnvMap } from './env-guard';
import {
  assertPreflightProbeSignals,
  assertResetSafetyGates,
  evaluatePreflightProbeSignals,
  isClientTlsVerificationConfigured,
  preflightBlockMessage,
  type PreflightBlockReason,
  type PreflightProbeDecision,
  type PreflightProbeSignals,
} from './reset-gates';
import {
  requireStagingDatabaseUrl,
  withStagingReadOnlyClient,
} from './reset-db-read';

export type ClientTransportVerification = {
  encrypted: boolean | null;
  authorized: boolean | null;
};

export type PreflightReport = PreflightProbeDecision & {
  clientTransportEncrypted: boolean | null;
  clientTransportAuthorized: boolean | null;
  preResetRemoteMigrationCount: number | null;
};

const SELECT1_SQL = 'SELECT 1 AS ok';
const BACKEND_SSL_SQL =
  'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()';

export class PreflightProbeError extends Error {
  readonly classification = 'BLOCKED_SAFETY_GUARD' as const;
  readonly preflightCause: PreflightBlockReason;
  readonly evidence: PreflightReport;

  constructor(evidence: PreflightReport) {
    const cause = evidence.preflightCause ?? 'BLOCKED_CONNECTIVITY';
    super(preflightBlockMessage(cause));
    this.name = 'PreflightProbeError';
    this.preflightCause = cause;
    this.evidence = evidence;
  }
}

/**
 * Reads documented TLSSocket booleans when pg 8 has already upgraded
 * `connection.stream`. Missing internals stay null and are not a gate.
 */
export function readClientTransportVerification(
  client: Client
): ClientTransportVerification {
  const connection = (client as { connection?: { stream?: object } })
    .connection;
  const stream = connection?.stream as
    | { encrypted?: unknown; authorized?: unknown }
    | undefined;
  if (!stream || typeof stream.encrypted !== 'boolean') {
    return { encrypted: null, authorized: null };
  }
  return {
    encrypted: stream.encrypted,
    authorized: stream.authorized === true,
  };
}

function emptyReport(
  overrides: Partial<PreflightReport> = {}
): PreflightReport {
  const decision = evaluatePreflightProbeSignals({
    clientConnectionVerified: false,
    select1Passed: false,
    clientTlsVerificationConfigured: false,
    backendPgStatSsl: null,
  });
  return {
    ...decision,
    clientTransportEncrypted: null,
    clientTransportAuthorized: null,
    preResetRemoteMigrationCount: null,
    ...overrides,
  };
}

function reportFromSignals(
  signals: PreflightProbeSignals,
  transport: ClientTransportVerification,
  preResetRemoteMigrationCount: number | null
): PreflightReport {
  return {
    ...evaluatePreflightProbeSignals(signals),
    clientTransportEncrypted: transport.encrypted,
    clientTransportAuthorized: transport.authorized,
    preResetRemoteMigrationCount,
  };
}

export async function runStagingResetPreflight(
  env: EnvMap,
  databaseUrl: string,
  dependencies: {
    withClient?: typeof withStagingReadOnlyClient;
    createConfig?: (connectionString: string) => ClientConfig;
  } = {}
): Promise<PreflightReport> {
  const withClient = dependencies.withClient ?? withStagingReadOnlyClient;
  const createConfig = dependencies.createConfig ?? createDatabaseClientConfig;

  let clientConfig: ClientConfig;
  try {
    clientConfig = createConfig(databaseUrl);
  } catch {
    throw new PreflightProbeError(
      emptyReport({
        preflightCause: 'BLOCKED_TLS_CONFIGURATION',
        tlsVerified: false,
      })
    );
  }

  const signals: PreflightProbeSignals = {
    clientConnectionVerified: false,
    select1Passed: false,
    clientTlsVerificationConfigured: false,
    backendPgStatSsl: null,
  };
  const transport: ClientTransportVerification = {
    encrypted: null,
    authorized: null,
  };

  signals.clientTlsVerificationConfigured = isClientTlsVerificationConfigured(
    env,
    clientConfig
  );
  if (!signals.clientTlsVerificationConfigured) {
    throw new PreflightProbeError(reportFromSignals(signals, transport, null));
  }

  try {
    const remoteMigrationCount = await withClient(databaseUrl, async client => {
      const observed = readClientTransportVerification(client);
      transport.encrypted = observed.encrypted;
      transport.authorized = observed.authorized;
      signals.clientConnectionVerified = true;

      let selectOk: unknown;
      try {
        const selectResult = await client.query<{ ok: number }>(SELECT1_SQL);
        selectOk = selectResult.rows[0]?.ok;
      } catch {
        throw new PreflightProbeError(
          reportFromSignals(signals, transport, null)
        );
      }
      signals.select1Passed = selectOk === 1;
      if (!signals.select1Passed) {
        throw new PreflightProbeError(
          reportFromSignals(signals, transport, null)
        );
      }

      try {
        const sslResult = await client.query<{ ssl: boolean | null }>(
          BACKEND_SSL_SQL
        );
        const ssl = sslResult.rows[0]?.ssl;
        signals.backendPgStatSsl =
          ssl === true ? true : ssl === false ? false : null;
      } catch {
        signals.backendPgStatSsl = null;
      }

      try {
        const versions = await client.query<{ version: string }>(
          'SELECT version FROM supabase_migrations.schema_migrations'
        );
        return versions.rows.length;
      } catch {
        console.error(
          'Pre-reset remote migration count is unavailable. Staging divergence is informational and does not block reset.'
        );
        return null;
      }
    });

    const decision = assertPreflightProbeSignals(signals);
    return {
      ...decision,
      clientTransportEncrypted: transport.encrypted,
      clientTransportAuthorized: transport.authorized,
      preResetRemoteMigrationCount: remoteMigrationCount,
    };
  } catch (error) {
    if (error instanceof PreflightProbeError) {
      throw error;
    }
    throw new PreflightProbeError(reportFromSignals(signals, transport, null));
  }
}

function writeGithubOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile || /[\r\n]/.test(value)) {
    return;
  }
  fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

function githubTriState(value: boolean | null): string {
  if (value === true) {
    return 'true';
  }
  if (value === false) {
    return 'false';
  }
  return '';
}

export function emitPreflightReport(report: PreflightReport): void {
  writeGithubOutput('tls_verified', report.tlsVerified ? 'true' : 'false');
  writeGithubOutput(
    'client_connection_verified',
    report.clientConnectionVerified ? 'true' : 'false'
  );
  writeGithubOutput('select1_passed', report.select1Passed ? 'true' : 'false');
  writeGithubOutput(
    'client_tls_verification_configured',
    report.clientTlsVerificationConfigured ? 'true' : 'false'
  );
  writeGithubOutput(
    'backend_pg_stat_ssl',
    githubTriState(report.backendPgStatSsl)
  );
  writeGithubOutput(
    'client_transport_encrypted',
    githubTriState(report.clientTransportEncrypted)
  );
  writeGithubOutput(
    'client_transport_authorized',
    githubTriState(report.clientTransportAuthorized)
  );
  writeGithubOutput('preflight_cause', report.preflightCause ?? '');
  writeGithubOutput(
    'pre_reset_remote_migration_count',
    report.preResetRemoteMigrationCount === null
      ? ''
      : String(report.preResetRemoteMigrationCount)
  );
  process.stdout.write(
    `${JSON.stringify({
      clientConnectionVerified: report.clientConnectionVerified,
      select1Passed: report.select1Passed,
      clientTlsVerificationConfigured: report.clientTlsVerificationConfigured,
      backendPgStatSsl: report.backendPgStatSsl,
      clientTransportEncrypted: report.clientTransportEncrypted,
      clientTransportAuthorized: report.clientTransportAuthorized,
      preflightCause: report.preflightCause,
      select1: report.select1Passed,
      tlsVerified: report.tlsVerified,
      targetVerified: true,
      preResetRemoteMigrationCount: report.preResetRemoteMigrationCount,
    })}\n`
  );
}

async function main(): Promise<void> {
  assertResetSafetyGates(process.env);
  const databaseUrl = requireStagingDatabaseUrl(
    process.env.STAGING_DATABASE_URL
  );
  const report = await runStagingResetPreflight(process.env, databaseUrl);
  emitPreflightReport(report);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch(error => {
    if (error instanceof PreflightProbeError) {
      emitPreflightReport(error.evidence);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
