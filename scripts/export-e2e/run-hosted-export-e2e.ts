import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { executeHostedCleanup } from '../auth-matrix/hosted-cleanup';
import { mintHostedActorSession } from '../auth-matrix/hosted-session';
import type { HostedActor } from '../auth-matrix/hosted-session';
import type { AuthMatrixActor } from '../auth-matrix/constants';
import {
  createEmptyRuntimeManifest,
  readRuntimeManifestFile,
  resolveRuntimeManifestPath,
  writeRuntimeManifestFile,
} from '../auth-matrix/runtime-manifest';
import type { RuntimeFixtureManifest } from '../auth-matrix/runtime-manifest';
import { runSalesApiCases } from './api-cases';
import { runBrowserExportCases } from './browser';
import type { ExportCaseResult } from './constants';
import { loadExportE2EEnvironment } from './env-guard';
import { bootstrapExportFixtures } from './fixtures';
import { readProductShaUnderTest } from './product-sha';
import { classifyExportRun, redactSecrets } from './report';
import { countExportResiduals, residualTotal } from './residuals';

type AuditObservation = {
  expectation: 'CURRENT_IMPLEMENTATION_NO_EXPORT_AUDIT';
  observed: 'NO_EXPORT_AUDIT' | 'EXPORT_AUDIT_PRESENT' | 'OTHER_AUDIT_PRESENT';
  rows: Array<{
    action: string;
    resource_type: string;
    resource_id: string;
    actor_id: string;
  }>;
};

function manifestPathFromEnv(): string {
  const configured = process.env.EXPORT_E2E_RUNTIME_MANIFEST?.trim();
  if (!configured) {
    throw new Error(
      'EXPORT_E2E_RUNTIME_MANIFEST is required so cleanup can target this run only.'
    );
  }
  return resolveRuntimeManifestPath({
    AUTH_MATRIX_RUNTIME_MANIFEST: configured,
  });
}

function auditText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function classifyAuditRows(data: unknown): AuditObservation {
  const rows = (Array.isArray(data) ? data : []).map(row => {
    const record =
      row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    return {
      action: auditText(record.action),
      resource_type: auditText(record.resource_type),
      resource_id: auditText(record.resource_id),
      actor_id: auditText(record.actor_id),
    };
  });
  const exportRows = rows.filter(row => /export|csv/i.test(row.action));
  return {
    expectation: 'CURRENT_IMPLEMENTATION_NO_EXPORT_AUDIT',
    observed:
      exportRows.length > 0
        ? 'EXPORT_AUDIT_PRESENT'
        : rows.length > 0
          ? 'OTHER_AUDIT_PRESENT'
          : 'NO_EXPORT_AUDIT',
    rows,
  };
}

async function observeAudit(
  admin: SupabaseClient,
  actorIds: string[],
  startedAt: string
): Promise<AuditObservation> {
  const result = await admin
    .from('audit_log')
    .select('action, resource_type, resource_id, actor_id, created_at')
    .in('actor_id', actorIds)
    .gte('created_at', startedAt);
  if (result.error) {
    throw new Error(`Audit observation failed: ${result.error.message}`);
  }
  return classifyAuditRows(result.data);
}

async function main(): Promise<void> {
  const productShaUnderTest = readProductShaUnderTest(
    process.env.EXPORT_E2E_PRODUCT_SHA
  );
  const env = loadExportE2EEnvironment();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const manifestPath = manifestPathFromEnv();
  let manifest = createEmptyRuntimeManifest('exportpending00000000');
  const cases: ExportCaseResult[] = [];
  let audit: AuditObservation | null = null;
  let runId = manifest.runId;
  let orgAId = '';
  let orgBId = '';
  let failure: string | null = null;

  const persist = async (next: RuntimeFixtureManifest) => {
    manifest = next;
    await writeRuntimeManifestFile(manifestPath, next);
  };
  await persist(manifest);

  try {
    const fixtures = await bootstrapExportFixtures({
      admin,
      persistManifest: persist,
    });
    manifest = fixtures.manifest;
    runId = fixtures.runId;
    orgAId = fixtures.orgAId;
    orgBId = fixtures.orgBId;

    const actors = {} as Record<AuthMatrixActor, HostedActor>;
    try {
      for (const user of fixtures.users) {
        const cookieHeader = await mintHostedActorSession({
          supabaseUrl: env.supabaseUrl,
          anonKey: env.supabaseAnonKey,
          email: user.email,
          password: user.password,
          expectedUserId: user.userId,
          expectedProjectRef: env.stagingProjectRef,
          productionProjectRef: env.productionProjectRef,
          actorLabel: user.label,
        });
        actors[user.label] = {
          userId: user.userId,
          orgId: user.orgId,
          role: user.role,
          label: user.label,
          cookieHeader,
        };
      }
    } finally {
      for (const user of fixtures.users) {
        user.password = '';
      }
    }

    const auditStartedAt = new Date().toISOString();
    cases.push(
      ...(await runSalesApiCases({
        appBaseUrl: env.appBaseUrl,
        orgAAdmin: actors.orgAAdmin,
        orgAMember: actors.orgAMember,
        orgBAdmin: actors.orgBAdmin,
        markers: fixtures.markers,
        keepSaleId: fixtures.keepSaleId,
        dropSaleId: fixtures.dropSaleId,
        orgBSaleId: fixtures.orgBSaleId,
      }))
    );
    cases.push(
      ...(await runBrowserExportCases({
        appBaseUrl: env.appBaseUrl,
        orgAAdmin: actors.orgAAdmin,
        orgAMember: actors.orgAMember,
        orgBAdmin: actors.orgBAdmin,
        markers: fixtures.markers,
        reservedUserId: fixtures.orgAAdminUserId,
        reservedConnectionId: fixtures.keepConnectionId,
        keepSaleId: fixtures.keepSaleId,
      }))
    );
    audit = await observeAudit(
      admin,
      fixtures.users.map(user => user.userId),
      auditStartedAt
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Export E2E run failed.';
  } finally {
    try {
      const current = (await readRuntimeManifestFile(manifestPath)) ?? manifest;
      manifest = current;
      runId = current.runId;
      await executeHostedCleanup(admin, current);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Export E2E cleanup failed.';
      failure = failure ? `${failure} | ${message}` : message;
    }
  }

  let residuals: Awaited<ReturnType<typeof countExportResiduals>> = [];
  let residualsVerified = false;
  try {
    residuals = await countExportResiduals(admin, manifest);
    residualsVerified = true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Residual verification failed.';
    failure = failure ? `${failure} | ${message}` : message;
  }
  const leftover = residualTotal(residuals);
  const cleanupFailed = Boolean(failure?.toLowerCase().includes('cleanup'));
  cases.push({
    id: 'cleanup-residuals',
    ok: residualsVerified && leftover === 0 && !cleanupFailed,
    detail: residualsVerified
      ? `residual fixtures = ${leftover}`
      : 'residual verification failed',
  });

  const classified = classifyExportRun(cases);
  const report = {
    classification: failure
      ? 'EXPORT_STAGING_E2E_FAIL'
      : classified.classification,
    product_sha_under_test: productShaUnderTest,
    harness_sha: process.env.GITHUB_SHA ?? 'local',
    staging_app_host: new URL(env.appBaseUrl).host,
    staging_project_ref: env.stagingProjectRef,
    production_target_touched: false,
    runId,
    orgAId,
    orgBId,
    cases,
    missing: classified.missing,
    audit,
    rate_limit: {
      export_bucket: 'sales:export',
      hosted_limit_exercise: 'not_repeated',
      note: 'One capped admin export request plus one UI export per admin. Invalid filter did not use export=true. Member 403 is before the export bucket.',
    },
    acceptance:
      'AUTH_MATRIX_ACCEPTANCE_PASS_SYNTHETIC_DISABLED + EXPORT_STAGING_E2E_PASS only when classification is EXPORT_STAGING_E2E_PASS. postdeploy-synthetic remains intentionally unverified. Not upgraded to STAGING-VERIFIED.',
    residuals,
    failure,
  };

  const printed = redactSecrets(JSON.stringify(report, null, 2), [
    env.supabaseAnonKey,
    env.serviceRoleKey,
    env.databaseUrl ?? '',
  ]);
  console.log(printed);
  if (report.classification !== 'EXPORT_STAGING_E2E_PASS') {
    process.exitCode = 1;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Export E2E failed.';
  console.error(message);
  process.exit(1);
});
