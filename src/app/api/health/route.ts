import { NextRequest, NextResponse } from 'next/server';
import packageJson from '../../../../package.json';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

// Node.js runtime required for process.uptime() and process.env access
export const runtime = 'nodejs';

const bootTime = Date.now();

async function getHandler(_request: NextRequest) {
  // ✅ FIXED: Suppress unused parameter warning
  void _request;
  const uptimeSeconds = Math.round(process.uptime());
  const migrations = await checkMigrations();

  const healthStatus = migrations.allHealthy ? 'ok' : 'degraded';

  return NextResponse.json({
    status: healthStatus,
    version: packageJson.version ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'unknown',
    uptimeSeconds,
    startedAt: new Date(bootTime).toISOString(),
    timestamp: new Date().toISOString(),
    migrations: {
      display_order: migrations.display_order,
      healthy: migrations.allHealthy,
    },
  });
}

export const GET = withSentryRoute(getHandler);
