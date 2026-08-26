import { NextRequest, NextResponse } from 'next/server';
import { DEPLOYMENT_SERVICE_NAME } from '@/app/api/_utils/deploymentHealth';
import {
  getOrCreateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';

/**
 * Liveness only: the process is alive and can serve HTTP.
 * Does not probe the database, schema, or third-party integrations.
 *
 * Compatibility: `/api/health` previously returned HTTP 503 (and optional
 * diagnostics) when catalog/schema checks failed. Those semantics moved to
 * GET `/api/ready`. Public liveness is always HTTP 200 while this process
 * can respond. See docs/DEPLOYMENT.md.
 */
export async function handleHealthGet(
  request: NextRequest
): Promise<NextResponse> {
  const requestId = getOrCreateRequestId(request);

  return withRequestIdHeader(
    NextResponse.json(
      {
        status: 'ok',
        service: DEPLOYMENT_SERVICE_NAME,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    ),
    requestId
  );
}
