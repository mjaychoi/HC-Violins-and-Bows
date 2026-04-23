import { NextResponse } from 'next/server';
import { checkMigrations } from '@/app/api/_utils/healthCheck';
import { checkInstrumentApiContractAdmin } from '@/app/api/instruments/_shared/instrumentApiContract';

export async function GET() {
  const [result, instrumentContract] = await Promise.all([
    checkMigrations(),
    checkInstrumentApiContractAdmin(),
  ]);
  const fallbackHealthy = result.allHealthy;
  const allHealthy = result.allHealthy && instrumentContract.ok;
  const checks = {
    display_order: result.display_order,
    tenantIsolationMigration:
      result.tenantIsolationMigration ?? fallbackHealthy,
    roleEnforcedWritePoliciesMigration:
      result.roleEnforcedWritePoliciesMigration ?? fallbackHealthy,
    requiredPoliciesPresent: result.requiredPoliciesPresent ?? fallbackHealthy,
    forbiddenPoliciesAbsent: result.forbiddenPoliciesAbsent ?? fallbackHealthy,
    authOrgIdHelperValid: result.authOrgIdHelperValid ?? fallbackHealthy,
    authIsAdminHelperValid: result.authIsAdminHelperValid ?? fallbackHealthy,
    criticalPolicyPredicatesValid:
      result.criticalPolicyPredicatesValid ?? fallbackHealthy,
    invoiceImageStoragePathShapeValid:
      result.invoiceImageStoragePathShapeValid ?? fallbackHealthy,
    requiredColumnsPresent: result.requiredColumnsPresent ?? fallbackHealthy,
    instrument_api_contract: {
      ok: instrumentContract.ok,
      missing: instrumentContract.missing,
    },
  };

  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'error',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
