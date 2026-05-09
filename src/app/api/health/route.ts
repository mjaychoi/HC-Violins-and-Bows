import { NextResponse } from 'next/server';
import { checkMigrations } from '@/app/api/_utils/healthCheck';
import { checkSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { checkInstrumentApiContractAdmin } from '@/app/api/instruments/_shared/instrumentApiContract';

type MigrationCheck = Awaited<ReturnType<typeof checkMigrations>>;
type SchemaReadinessCheck = Awaited<ReturnType<typeof checkSchemaReadiness>>;
type InstrumentContractCheck = Awaited<
  ReturnType<typeof checkInstrumentApiContractAdmin>
>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildFailedMigrationCheck(): MigrationCheck {
  return {
    display_order: false,
    tenantIsolationMigration: false,
    roleEnforcedWritePoliciesMigration: false,
    requiredPoliciesPresent: false,
    forbiddenPoliciesAbsent: false,
    authOrgIdHelperValid: false,
    authIsAdminHelperValid: false,
    criticalPolicyPredicatesValid: false,
    invoiceImageStoragePathShapeValid: false,
    requiredColumnsPresent: false,
    allHealthy: false,
    missingMigrationVersions: ['health_check_failed'],
    missingPolicies: [],
    forbiddenPoliciesPresent: [],
    invalidHelpers: [],
    unsafePolicies: [],
    missingColumns: [],
  };
}

function buildFailedInstrumentContractCheck(
  error: unknown
): InstrumentContractCheck & { error?: string } {
  return {
    ok: false,
    missing: ['instrument_api_contract_check_failed'],
    error: getErrorMessage(error),
  };
}

function buildFailedSchemaReadinessCheck(
  error: unknown
): SchemaReadinessCheck & { error?: string } {
  return {
    ready: false,
    checkedAt: new Date().toISOString(),
    missingColumns: [],
    missingContracts: ['schema_readiness_check_failed'],
    error: getErrorMessage(error),
  };
}

export async function GET() {
  const timestamp = new Date().toISOString();

  const [migrationResult, schemaReadinessResult, instrumentContractResult] =
    await Promise.allSettled([
      checkMigrations(),
      checkSchemaReadiness({ bypassCache: true }),
      checkInstrumentApiContractAdmin(),
    ]);

  const migrations =
    migrationResult.status === 'fulfilled'
      ? migrationResult.value
      : buildFailedMigrationCheck();

  const instrumentContract =
    instrumentContractResult.status === 'fulfilled'
      ? instrumentContractResult.value
      : buildFailedInstrumentContractCheck(instrumentContractResult.reason);

  const schemaReadiness =
    schemaReadinessResult.status === 'fulfilled'
      ? schemaReadinessResult.value
      : buildFailedSchemaReadinessCheck(schemaReadinessResult.reason);

  const allHealthy =
    migrations.allHealthy && schemaReadiness.ready && instrumentContract.ok;
  const fallbackHealthy = migrations.allHealthy;

  const checks = {
    display_order: migrations.display_order,
    tenantIsolationMigration:
      migrations.tenantIsolationMigration ?? fallbackHealthy,
    roleEnforcedWritePoliciesMigration:
      migrations.roleEnforcedWritePoliciesMigration ?? fallbackHealthy,
    requiredPoliciesPresent:
      migrations.requiredPoliciesPresent ?? fallbackHealthy,
    forbiddenPoliciesAbsent:
      migrations.forbiddenPoliciesAbsent ?? fallbackHealthy,
    authOrgIdHelperValid: migrations.authOrgIdHelperValid ?? fallbackHealthy,
    authIsAdminHelperValid:
      migrations.authIsAdminHelperValid ?? fallbackHealthy,
    criticalPolicyPredicatesValid:
      migrations.criticalPolicyPredicatesValid ?? fallbackHealthy,
    invoiceImageStoragePathShapeValid:
      migrations.invoiceImageStoragePathShapeValid ?? fallbackHealthy,
    requiredColumnsPresent:
      migrations.requiredColumnsPresent ?? fallbackHealthy,
    runtime_contracts: {
      ok: schemaReadiness.missingContracts.length === 0,
      missing: schemaReadiness.missingContracts,
      ...('error' in schemaReadiness && schemaReadiness.error
        ? { error: schemaReadiness.error }
        : {}),
    },

    instrument_api_contract: {
      ok: instrumentContract.ok,
      missing: instrumentContract.missing,
      ...('error' in instrumentContract && instrumentContract.error
        ? { error: instrumentContract.error }
        : {}),
    },
  };

  const diagnostics = {
    missingMigrationVersions: migrations.missingMigrationVersions,
    missingPolicies: migrations.missingPolicies,
    forbiddenPoliciesPresent: migrations.forbiddenPoliciesPresent,
    invalidHelpers: migrations.invalidHelpers,
    unsafePolicies: migrations.unsafePolicies,
    missingColumns: [
      ...(migrations.missingColumns ?? []),
      ...(schemaReadiness.missingColumns ?? []),
    ],
    missingRuntimeContracts: schemaReadiness.missingContracts ?? [],
  };

  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'error',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      timestamp,
      checks,
      diagnostics,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
