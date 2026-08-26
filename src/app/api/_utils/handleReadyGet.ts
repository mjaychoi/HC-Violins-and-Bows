import { NextRequest, NextResponse } from 'next/server';
import { canViewHealthDiagnostics } from '@/app/api/_utils/healthDiagnosticsAuth';
import {
  createDefaultReadinessDependencies,
  runReadinessChecks,
  type ReadinessDependencies,
  type ReadinessResult,
} from '@/app/api/_utils/readinessCheck';
import {
  getOrCreateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';
import { logInfo, logWarn } from '@/utils/logger';

export type HandleReadyGetOptions = {
  deps?: ReadinessDependencies;
};

function publicPayload(result: ReadinessResult) {
  return {
    status: result.ready ? 'ready' : 'not_ready',
    checks: result.checks,
  };
}

function diagnosticsPayload(result: ReadinessResult) {
  return {
    ...publicPayload(result),
    diagnostics: {
      codes: result.codes,
      durationsMs: result.durationsMs,
      timedOut: result.timedOut,
    },
  };
}

export async function handleReadyGet(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
  options: HandleReadyGetOptions = {}
): Promise<NextResponse> {
  const requestId = getOrCreateRequestId(request);
  const includeDiagnostics = canViewHealthDiagnostics(request, env);
  const deps = options.deps ?? {
    ...createDefaultReadinessDependencies(),
  };

  const result = await runReadinessChecks(env, deps);
  const logMeta = {
    requestId,
    checks: result.checks,
    codes: result.codes,
    durationsMs: result.durationsMs,
    timedOut: result.timedOut,
  };

  if (result.ready) {
    logInfo('readiness_ok', 'readiness', logMeta);
  } else {
    logWarn('readiness_not_ready', 'readiness', logMeta);
  }

  const body = includeDiagnostics
    ? diagnosticsPayload(result)
    : publicPayload(result);

  return withRequestIdHeader(
    NextResponse.json(body, {
      status: result.ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }),
    requestId
  );
}
