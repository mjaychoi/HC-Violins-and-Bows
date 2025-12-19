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
  metadata?: Record<string, unknown>;
}

export type ApiHandlerFn = () => Promise<{
  payload: unknown;
  status?: number;
  metadata?: Record<string, unknown>;
}>;

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
 * - error.status, appError.status, appError.statusCode를 순차적으로 확인
 * - 400-599 범위의 유효한 코드만 반환, 없으면 500
 * - 다른 파일에서도 재사용 가능하도록 export
 */
export function resolveHttpStatus(
  error: unknown,
  appError: AppErrorWithStatus | undefined
): number {
  const candidates = [
    (error as { status?: unknown } | null)?.status,
    appError?.status,
    appError?.statusCode,
  ];

  for (const v of candidates) {
    if (typeof v === 'number' && v >= 400 && v < 600) return v;
  }
  return 500;
}

/**
 * 공통 API 핸들러 헬퍼
 * - 성능 측정 (duration)
 * - 에러 처리 및 로깅
 * - 일관된 응답 형식
 *
 * @example
 * ```ts
 * async function getHandler(request: NextRequest, _user: User) {
 *   return apiHandler(
 *     request,
 *     { method: 'GET', path: 'ConnectionsAPI', context: 'ConnectionsAPI' },
 *     async () => {
 *       const supabase = getServerSupabase();
 *       const { data, error } = await supabase.from('client_instruments').select('*');
 *
 *       if (error) {
 *         throw errorHandler.handleSupabaseError(error, 'Fetch connections');
 *       }
 *
 *       return {
 *         payload: { data, count: 0 },
 *         metadata: { recordCount: data?.length || 0 }
 *       };
 *     }
 *   );
 * }
 * ```
 */
export async function apiHandler(
  request: NextRequest,
  meta: ApiHandlerMeta,
  fn: ApiHandlerFn
): Promise<NextResponse> {
  const startTime = performance.now();

  try {
    const result = await fn();
    const duration = Math.round(performance.now() - startTime);
    const status = result.status || 200;

    // 실제 요청 경로를 사용 (동적 라우트 포함)
    const path = request.nextUrl.pathname;

    // validationWarning이 있으면 경고를 로깅
    if (result.metadata?.validationWarning) {
      captureException(
        new Error(
          'Data validation warning: Response data did not pass validation'
        ),
        `${meta.context}.${meta.method}`,
        {
          ...meta.metadata,
          ...result.metadata,
          path,
          status,
        },
        ErrorSeverity.LOW
      );
    }

    // 성공 로깅
    logApiRequest(meta.method, path, status, duration, meta.context, {
      ...meta.metadata,
      ...result.metadata,
    });

    // payload를 그대로 반환 (각 API가 원하는 형태 유지)
    return NextResponse.json(result.payload, { status });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      `${meta.context}.${meta.method}`
    ) as AppErrorWithStatus;

    // resolveHttpStatus로 status 결정 (타입 안전)
    const status = resolveHttpStatus(error, appError);

    // 실제 요청 경로를 사용 (동적 라우트 포함)
    const path = request.nextUrl.pathname;

    // 에러 로깅
    logApiRequest(meta.method, path, status, duration, meta.context, {
      ...meta.metadata,
      error: true,
      errorCode: appError?.code,
    });

    // Capture exception for monitoring
    captureException(
      error instanceof Error ? error : new Error(String(error)),
      `${meta.context}.${meta.method}`,
      {
        ...meta.metadata,
        errorCode: appError?.code,
        status,
        path,
      },
      ErrorSeverity.MEDIUM
    );

    const safeError = createSafeErrorResponse(appError, status);
    return NextResponse.json(safeError, { status });
  }
}
