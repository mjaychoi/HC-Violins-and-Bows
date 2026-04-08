import { NextResponse } from 'next/server';

export interface ApiErrorEnvelope {
  message: string;
  error: string; // Legacy: back-compat for existing tests
  success: boolean; // Added for flat error structure
  error_code?: string;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
}

type ApiErrorEnvelopeInit = {
  message: string;
  error_code?: string;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
};

export function inferRetryable(status: number): boolean {
  return status >= 500;
}

export function createApiErrorEnvelope(
  init: ApiErrorEnvelopeInit,
  status: number
): ApiErrorEnvelope {
  return {
    message: init.message,
    error: init.message, // Ensure it's never undefined
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
  const envelope = createApiErrorEnvelope(init, status);
  return NextResponse.json(envelope, { status });
}

export function createApiResponse(
  payload: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(
    status >= 400 ? normalizeApiErrorPayload(payload, status) : payload,
    { status }
  );
}

export function isApiErrorLikePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.message === 'string' ||
    typeof candidate.error === 'string' ||
    typeof candidate.error_code === 'string'
  );
}

export function normalizeApiErrorPayload(
  payload: unknown,
  status: number
): ApiErrorEnvelope {
  if (!payload || typeof payload !== 'object') {
    return createApiErrorEnvelope(
      { message: 'An unexpected error occurred.' },
      status
    );
  }

  const candidate = payload as Record<string, unknown>;
  const messageCandidate = candidate.message ?? candidate.error;
  const message =
    typeof messageCandidate === 'string' && messageCandidate.trim()
      ? messageCandidate
      : 'An unexpected error occurred.';

  return createApiErrorEnvelope(
    {
      message,
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
