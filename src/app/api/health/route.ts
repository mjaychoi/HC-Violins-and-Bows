import { NextResponse } from 'next/server';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

export async function GET() {
  const result = await checkMigrations();

  return NextResponse.json(
    {
      status: result.allHealthy ? 'ok' : 'error',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
      timestamp: new Date().toISOString(),
      checks: {
        forbiddenPoliciesAbsent: result.forbiddenPoliciesAbsent ?? true,
        authOrgIdHelperValid: result.authOrgIdHelperValid,
        authIsAdminHelperValid: result.authIsAdminHelperValid,
        criticalPolicyPredicatesValid: result.criticalPolicyPredicatesValid,
        requiredPoliciesPresent: result.requiredPoliciesPresent,
        invoiceImageStoragePathShapeValid:
          result.invoiceImageStoragePathShapeValid,
      },
    },
    {
      status: result.allHealthy ? 200 : 503,
    }
  );
}
