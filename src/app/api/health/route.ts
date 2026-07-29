import { NextResponse } from 'next/server';
import { checkMigrations } from '@/app/api/_utils/healthCheck';
import { checkInstrumentApiContractAdmin } from '@/app/api/instruments/_shared/instrumentApiContract';

type MigrationCheck = Awaited<ReturnType<typeof checkMigrations>>;
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
    runtimeContractsPresent: false,
    catalogAccessFailed: true,
    allHealthy: false,
    missingMigrationVersions: ['health_check_failed'],
    missingPolicies: [],
    forbiddenPoliciesPresent: [],
    invalidHelpers: [],
    unsafePolicies: [],
    missingColumns: [],
    missingRuntimeContracts: [],
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

export async function GET() {
  const timestamp = new Date().toISOString();

  const [migrationResult, instrumentContractResult] = await Promise.allSettled([
    checkMigrations(),
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

  const allHealthy =
    !migrations.catalogAccessFailed &&
    migrations.allHealthy &&
    instrumentContract.ok;
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
      ok: migrations.runtimeContractsPresent ?? fallbackHealthy,
      missing: migrations.missingRuntimeContracts ?? [],
    },
    instrument_api_contract: {
      ok: instrumentContract.ok,
      missing: instrumentContract.missing,
      ...('error' in instrumentContract && instrumentContract.error
        ? { error: instrumentContract.error }
        : {}),
    },
  };

  const diagnostics = migrations.catalogAccessFailed
    ? {
        catalogAccessFailed: true,
      }
    : {
        missingMigrationVersions: migrations.missingMigrationVersions,
        missingPolicies: migrations.missingPolicies,
        forbiddenPoliciesPresent: migrations.forbiddenPoliciesPresent,
        invalidHelpers: migrations.invalidHelpers,
        unsafePolicies: migrations.unsafePolicies,
        missingColumns: migrations.missingColumns ?? [],
        missingRuntimeContracts: migrations.missingRuntimeContracts ?? [],
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
