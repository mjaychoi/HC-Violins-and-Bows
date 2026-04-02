import { NextRequest, NextResponse } from 'next/server';
import packageJson from '../../../../package.json';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

// Node.js runtime required for process.uptime() and process.env access
export const runtime = 'nodejs';

async function getHandler(_request: NextRequest) {
  // ✅ FIXED: Suppress unused parameter warning
  void _request;
  const migrations = await checkMigrations();

  const healthStatus = migrations.allHealthy ? 'ok' : 'degraded';

  return NextResponse.json({
    status: healthStatus,
    version: packageJson.version ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

export const GET = withSentryRoute(getHandler);
