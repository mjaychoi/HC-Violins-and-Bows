import { NextRequest, NextResponse } from 'next/server';

import { extractPostgrestLikeErrorSnapshot } from '@/app/api/_utils/postgrestErrorSnapshot';
import { getSupabaseConnectionDiagnostics } from '@/lib/supabaseConnectionDiagnostics';
import { ErrorCodes, ErrorSeverity } from '@/types/errors';
import type { AppError } from '@/types/errors';
import { createSafeErrorResponse } from '@/utils/errorSanitization';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest, logError } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';

import {
  isApiErrorLikePayload,
  normalizeApiErrorPayload,
} from '@/app/api/_utils/apiErrors';
import {
  getOrCreateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';

export interface ApiHandlerMeta {
  method: string;
  path: string; // normalized route key for logs/monitoring
  context: string;
  /**
   * Only include safe metadata here.
   * Never include PII, tokens, raw request bodies, or secrets.
   */
  metadata?: Record<string, unknown>;
}

export type ApiOk<T> = {
  payload: T;
  status?: number;
  metadata?: Record<string, unknown>;
};

export type ApiErr = {
  payload: Record<string, unknown>;
  status?: number;
  metadata?: Record<string, unknown>;
};

export type ApiHandlerResult = ApiOk<unknown> | ApiErr;
export type ApiHandlerFn = (req: NextRequest) => Promise<ApiHandlerResult>;

export interface AppErrorWithStatus extends AppError {
  status?: number;
  statusCode?: number;
}

type ErrorHandlerPlugin = {
  isSupabaseError?: (error: unknown) => boolean;
  handleUnknownError?: (
    error: unknown,
    context: string
  ) => AppErrorWithStatus | undefined;
};

const errorHandlerPlugin = errorHandler as ErrorHandlerPlugin;

const now = () =>
  typeof globalThis.performance !== 'undefined'
    ? globalThis.performance.now()
    : Date.now();

function isValidHttpStatus(value: unknown): value is number {
  return typeof value === 'number' && value >= 200 && value < 600;
}

function resolveResultStatus(result: ApiHandlerResult): number {
  if (isValidHttpStatus(result.status)) {
    return result.status;
  }

  return isApiErrorLikePayload(result.payload) ? 400 : 200;
}

export function resolveHttpStatus(
  error: unknown,
  appError: AppErrorWithStatus | undefined
): number {
  const responseStatus = error instanceof Response ? error.status : undefined;

  const candidates = [
    (error as { status?: unknown } | null)?.status,
    (error as { statusCode?: unknown } | null)?.statusCode,
    responseStatus,
    appError?.status,
    appError?.statusCode,
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && value >= 400 && value < 600) {
      return value;
    }
  }

  return 500;
}

export function toAppError(
  error: unknown,
  context: string
): AppErrorWithStatus {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return error as AppErrorWithStatus;
  }

  if (errorHandlerPlugin.isSupabaseError?.(error)) {
    return errorHandler.handleSupabaseError(
      error,
      context
    ) as AppErrorWithStatus;
  }

  const handledUnknown = errorHandlerPlugin.handleUnknownError?.(
    error,
    context
  );

  if (handledUnknown) {
    return handledUnknown;
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unexpected error',
    status: 500,
  } as AppErrorWithStatus;
}

export function buildSafeCaptureMeta(
  meta: ApiHandlerMeta,
  extras: Record<string, unknown>
): Record<string, unknown> {
  return {
    routeKey: meta.path,
    context: meta.context,
    ...extras,
  };
}

function buildSuccessPayload(result: ApiHandlerResult): {
  status: number;
  payload: unknown;
  isErrorPayload: boolean;
} {
  const status = resolveResultStatus(result);
  const isErrorPayload = status >= 400;

  return {
    status,
    payload: isErrorPayload
      ? normalizeApiErrorPayload(result.payload, status)
      : result.payload,
    isErrorPayload,
  };
}

function logSuccessResponse(params: {
  meta: ApiHandlerMeta;
  path: string;
  requestId: string;
  duration: number;
  result: ApiHandlerResult;
  status: number;
  payload: unknown;
  isErrorPayload: boolean;
}): void {
  const {
    meta,
    path,
    requestId,
    duration,
    result,
    status,
    payload,
    isErrorPayload,
  } = params;

  logApiRequest(meta.method, path, status, duration, meta.context, {
    ...meta.metadata,
    ...result.metadata,
    routeKey: meta.path,
    requestId,
    error: isErrorPayload,
    errorMessage: isErrorPayload
      ? (payload as { message?: string }).message
      : undefined,
  });
}

function logDataLayerError(params: {
  error: unknown;
  meta: ApiHandlerMeta;
  path: string;
  requestId: string;
  appError: AppErrorWithStatus;
}): void {
  const { error, meta, path, requestId, appError } = params;

  const postgrestSnapshot = extractPostgrestLikeErrorSnapshot(error);
  const supabaseDiag = getSupabaseConnectionDiagnostics();

  const shouldLogDataLayerError =
    Boolean(postgrestSnapshot) ||
    appError.code === ErrorCodes.DATABASE_ERROR ||
    appError.code === ErrorCodes.FORBIDDEN ||
    appError.code === ErrorCodes.RECORD_NOT_FOUND;

  if (!shouldLogDataLayerError) {
    return;
  }

  logError(
    'API handler: data layer error (PostgREST snapshot for operators)',
    error,
    `${meta.context}.${meta.method}`,
    {
      requestId,
      routeKey: meta.path,
      httpPath: path,
      supabaseHost: supabaseDiag.host,
      supabaseProjectRef: supabaseDiag.projectRef,
      supabaseUrlSource: supabaseDiag.urlSource,
      postgrest: postgrestSnapshot,
      appErrorCode: appError.code,
      appErrorMessage: appError.message,
    }
  );
}

function captureApiHandlerError(params: {
  error: unknown;
  meta: ApiHandlerMeta;
  path: string;
  requestId: string;
  appError: AppErrorWithStatus;
  status: number;
}): void {
  const { error, meta, path, requestId, appError, status } = params;
  const supabaseDiag = getSupabaseConnectionDiagnostics();

  captureException(
    error instanceof Error ? error : new Error(String(error)),
    `${meta.context}.${meta.method}`,
    buildSafeCaptureMeta(meta, {
      errorCode: appError.code,
      status,
      path,
      method: meta.method,
      requestId,
      supabaseProjectRef: supabaseDiag.projectRef,
      supabaseUrlSource: supabaseDiag.urlSource,
    }),
    ErrorSeverity.MEDIUM
  );
}

function buildJsonResponse(
  payload: unknown,
  status: number,
  requestId: string
): NextResponse {
  return withRequestIdHeader(NextResponse.json(payload, { status }), requestId);
}

export async function apiHandler(
  request: NextRequest,
  meta: ApiHandlerMeta,
  fn: ApiHandlerFn
): Promise<NextResponse> {
  const startTime = now();
  const path = request.nextUrl.pathname;
  const requestId = getOrCreateRequestId(request);

  try {
    const result = await fn(request);
    const duration = Math.round(now() - startTime);

    const { status, payload, isErrorPayload } = buildSuccessPayload(result);

    logSuccessResponse({
      meta,
      path,
      requestId,
      duration,
      result,
      status,
      payload,
      isErrorPayload,
    });

    return buildJsonResponse(payload, status, requestId);
  } catch (error) {
    const duration = Math.round(now() - startTime);

    if (process.env.NODE_ENV === 'test') {
      console.error('API handler error', error);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }

    const appError = toAppError(error, `${meta.context}.${meta.method}`);
    const status = resolveHttpStatus(error, appError);

    logDataLayerError({
      error,
      meta,
      path,
      requestId,
      appError,
    });

    logApiRequest(meta.method, path, status, duration, meta.context, {
      ...meta.metadata,
      routeKey: meta.path,
      requestId,
      error: true,
      errorCode: appError.code,
    });

    captureApiHandlerError({
      error,
      meta,
      path,
      requestId,
      appError,
      status,
    });

    return buildJsonResponse(
      createSafeErrorResponse(appError, status),
      status,
      requestId
    );
  }
}
