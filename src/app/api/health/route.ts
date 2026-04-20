import { NextResponse } from 'next/server';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

export async function GET() {
  const result = await checkMigrations();
  const fallbackHealthy = result.allHealthy;
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
  };

  return NextResponse.json(
    {
      status: result.allHealthy ? 'ok' : 'error',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: result.allHealthy ? 200 : 503 }
  );
}
