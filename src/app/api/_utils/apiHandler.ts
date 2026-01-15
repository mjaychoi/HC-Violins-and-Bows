import { NextRequest, NextResponse } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { createSafeErrorResponse } from '@/utils/errorSanitization';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import type { AppError } from '@/types/errors';

export interface ApiHandlerMeta {
  method: string;
  path: string; // 정규화된 라우트 이름 (로깅용 컨텍스트, 실제 경로는 request.nextUrl.pathname 사용)
  context: string;
  /**
   * ⚠️ 모니터링/로깅으로 나가도 되는 "안전한" 메타데이터만 넣기
   * (PII, 토큰, 원문 body 등 금지)
   */
  metadata?: Record<string, unknown>;
}

export type ApiOk<T> = {
  payload: T;
  status?: number;
  metadata?: Record<string, unknown>;
};

export type ApiErr = {
  payload: { error: string };
  status?: number;
  metadata?: Record<string, unknown>;
};

export type ApiHandlerResult = ApiOk<unknown> | ApiErr;
export type ApiHandlerFn = (req: NextRequest) => Promise<ApiHandlerResult>;

/**
 * Extended AppError with HTTP status information
 * Used in apiHandler for type-safe status code extraction
 */
export interface AppErrorWithStatus extends AppError {
  status?: number;
  statusCode?: number;
}

/**
 * 에러 객체에서 유효한 HTTP status 코드를 추출
 * - error.status, error.statusCode, (Response이면 response.status),
 *   appError.status, appError.statusCode를 순차적으로 확인
 * - 400-599 범위의 유효한 코드만 반환, 없으면 500
 * - 다른 파일에서도 재사용 가능하도록 export
 */
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

  for (const v of candidates) {
    if (typeof v === 'number' && v >= 400 && v < 600) return v;
  }
  return 500;
}

/**
 * error를 AppError로 정규화.
 * - 이미 AppError면 보존
 * - Supabase 에러면 handleSupabaseError
 * - 그 외는 generic(unknown) 처리
 *
 * NOTE: errorHandler에 isSupabaseError / handleUnknownError가 없을 수도 있어
 *       -> 안전하게 optional chaining + fallback으로 처리
 */
type ErrorHandlerPlugin = {
  isSupabaseError?: (error: unknown) => boolean;
  handleUnknownError?: (
    error: unknown,
    context: string
  ) => AppErrorWithStatus | undefined;
};

const errorHandlerPlugin = errorHandler as ErrorHandlerPlugin;

export function toAppError(
  error: unknown,
  context: string
): AppErrorWithStatus {
  // 1) 이미 AppError처럼 보이면 그대로 사용 (code가 있는지로 최소 판별)
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return error as AppErrorWithStatus;
  }

  // 2) Supabase 에러만 변환
  const isSupabaseError = errorHandlerPlugin.isSupabaseError?.(error);

  if (isSupabaseError) {
    return errorHandler.handleSupabaseError(
      error,
      context
    ) as AppErrorWithStatus;
  }

  // 3) 그 외: 있으면 unknown handler 사용, 없으면 최소 fallback
  const handledUnknown = errorHandlerPlugin.handleUnknownError?.(
    error,
    context
  );

  if (handledUnknown) return handledUnknown;

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unexpected error',
    status: 500,
  } as AppErrorWithStatus;
}

/**
 * 모니터링(captureException)에 넣을 메타데이터를 allowlist로 제한
 * - meta.metadata를 그대로 보내지 않음
 * - 여기서는 기본 필드만 포함하고, 필요하면 allowlist 키를 추가해서 쓰기
 */
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

/**
 * 공통 API 핸들러 헬퍼
 * - 성능 측정 (duration)
 * - 에러 처리 및 로깅
 * - 일관된 응답 형식 (JSON)
 */
const now = () =>
  typeof globalThis.performance !== 'undefined'
    ? globalThis.performance.now()
    : Date.now();

export async function apiHandler(
  request: NextRequest,
  meta: ApiHandlerMeta,
  fn: ApiHandlerFn
): Promise<NextResponse> {
  const startTime = now();
  const path = request.nextUrl.pathname;

  try {
    const result = await fn(request);
    const duration = Math.round(now() - startTime);
    const payload = result.payload;
    const isErrorPayload =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string';

    const status =
      typeof result.status === 'number' &&
      result.status >= 200 &&
      result.status < 600
        ? result.status
        : isErrorPayload
          ? 400
          : 200;

    logApiRequest(meta.method, path, status, duration, meta.context, {
      ...meta.metadata,
      ...result.metadata,
      routeKey: meta.path, // 정규화 키
      error: isErrorPayload,
      errorMessage: isErrorPayload
        ? (payload as { error: string }).error
        : undefined,
    });

    return NextResponse.json(payload, { status });
  } catch (error) {
    const duration = Math.round(now() - startTime);

    if (process.env.NODE_ENV === 'test') {
      console.error('API handler error', error);
    }

    // ✅ supabase가 아닌 에러까지 supabase로 뭉개지지 않도록 정규화
    const appError = toAppError(error, `${meta.context}.${meta.method}`);

    const status = resolveHttpStatus(error, appError);

    logApiRequest(meta.method, path, status, duration, meta.context, {
      ...meta.metadata,
      routeKey: meta.path,
      error: true,
      errorCode: appError.code,
    });

    // ✅ captureException에는 allowlist meta만
    captureException(
      error instanceof Error ? error : new Error(String(error)),
      `${meta.context}.${meta.method}`,
      buildSafeCaptureMeta(meta, {
        errorCode: appError.code,
        status,
        path,
        method: meta.method,
      }),
      ErrorSeverity.MEDIUM
    );

    return NextResponse.json(createSafeErrorResponse(appError, status), {
      status,
    });
  }
}
