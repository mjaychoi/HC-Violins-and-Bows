import { NextResponse } from 'next/server';

export interface ApiErrorEnvelope {
  message: string;
  error: string; // Legacy: back-compat for existing tests
  success: false;
  error_code?: string;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
}

export type ApiErrorEnvelopeInit = {
  message: string;
  error_code?: string;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
};

const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred.';

export function inferRetryable(status: number): boolean {
  return status >= 500;
}

export function createApiErrorEnvelope(
  init: ApiErrorEnvelopeInit,
  status: number
): ApiErrorEnvelope {
  return {
    message: init.message,
    error: init.message,
    success: false,
    error_code: init.error_code,
    details: init.details,
    retryable:
      typeof init.retryable === 'boolean'
        ? init.retryable
        : inferRetryable(status),
    retry_after_seconds: init.retry_after_seconds,
  };
}

export function createApiErrorResponse(
  init: ApiErrorEnvelopeInit,
  status: number
): NextResponse {
  return NextResponse.json(createApiErrorEnvelope(init, status), { status });
}

export function createApiResponse(
  payload: unknown,
  status = 200
): NextResponse {
  const body =
    status >= 400 ? normalizeApiErrorPayload(payload, status) : payload;

  return NextResponse.json(body, { status });
}

export function isApiErrorLikePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Record<string, unknown>;

  if (candidate.success === false) return true;
  if (typeof candidate.error_code === 'string' && candidate.error_code.trim()) {
    return true;
  }
  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return true;
  }

  return false;
}

function getErrorMessage(candidate: Record<string, unknown>): string {
  const messageCandidate = candidate.message ?? candidate.error;

  if (typeof messageCandidate === 'string' && messageCandidate.trim()) {
    return messageCandidate;
  }

  return DEFAULT_ERROR_MESSAGE;
}

export function normalizeApiErrorPayload(
  payload: unknown,
  status: number
): ApiErrorEnvelope {
  if (!payload || typeof payload !== 'object') {
    return createApiErrorEnvelope({ message: DEFAULT_ERROR_MESSAGE }, status);
  }

  const candidate = payload as Record<string, unknown>;

  return createApiErrorEnvelope(
    {
      message: getErrorMessage(candidate),
      error_code:
        typeof candidate.error_code === 'string'
          ? candidate.error_code
          : undefined,
      details: candidate.details,
      retryable:
        typeof candidate.retryable === 'boolean'
          ? candidate.retryable
          : undefined,
      retry_after_seconds:
        typeof candidate.retry_after_seconds === 'number'
          ? candidate.retry_after_seconds
          : undefined,
    },
    status
  );
}
