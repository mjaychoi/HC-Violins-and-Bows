import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';

// Node.js runtime required for process.uptime() and process.env access
export const runtime = 'nodejs';

const bootTime = Date.now();

export async function GET() {
  try {
    const uptimeSeconds = Math.round(process.uptime());

    return NextResponse.json({
      status: 'ok',
      version: packageJson.version ?? 'unknown',
      environment: process.env.NODE_ENV ?? 'unknown',
      uptimeSeconds,
      startedAt: new Date(bootTime).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const appError = errorHandler.handleSupabaseError(error, 'Health check');
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'HealthAPI.GET',
      { logMessage: logInfo.message },
      ErrorSeverity.MEDIUM
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
