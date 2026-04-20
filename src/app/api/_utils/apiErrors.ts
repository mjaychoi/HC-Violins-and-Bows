import { NextResponse } from 'next/server';
import {
  generateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';

export interface ApiErrorEnvelope {
  message: string;
  error: string; // Legacy: back-compat for existing tests
  success: false;
  error_code?: string;
  data?: unknown;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
  request_id?: string;
}

export type ApiErrorEnvelopeInit = {
  message: string;
  error_code?: string;
  data?: unknown;
  details?: unknown;
  retryable?: boolean;
  retry_after_seconds?: number;
  request_id?: string;
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
    data: init.data,
    details: init.details,
    retryable:
      typeof init.retryable === 'boolean'
        ? init.retryable
        : inferRetryable(status),
    retry_after_seconds: init.retry_after_seconds,
    request_id: init.request_id,
  };
}

export function createApiErrorResponse(
  init: ApiErrorEnvelopeInit,
  status: number
): NextResponse {
  const requestId = init.request_id?.trim() || generateRequestId();

  return withRequestIdHeader(
    NextResponse.json(
      createApiErrorEnvelope(
        {
          ...init,
          request_id: requestId,
        },
        status
      ),
      { status }
    ),
    requestId
  );
}

export function createApiResponse(
  payload: unknown,
  status = 200
): NextResponse {
  if (status >= 400) {
    const requestId = generateRequestId();
    const body = normalizeApiErrorPayload(payload, status, requestId);

    return withRequestIdHeader(NextResponse.json(body, { status }), requestId);
  }

  return NextResponse.json(payload, { status });
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
  if (
    candidate.error &&
    typeof candidate.error === 'object' &&
    (typeof (candidate.error as { message?: unknown }).message === 'string' ||
      typeof (candidate.error as { code?: unknown }).code === 'string')
  ) {
    return true;
  }

  return false;
}

function getErrorMessage(candidate: Record<string, unknown>): string {
  const nestedError =
    candidate.error && typeof candidate.error === 'object'
      ? (candidate.error as Record<string, unknown>)
      : null;
  const messageCandidate =
    candidate.message ??
    (typeof candidate.error === 'string' ? candidate.error : undefined) ??
    nestedError?.message;

  if (typeof messageCandidate === 'string' && messageCandidate.trim()) {
    return messageCandidate;
  }

  return DEFAULT_ERROR_MESSAGE;
}

export function normalizeApiErrorPayload(
  payload: unknown,
  status: number,
  requestId?: string
): ApiErrorEnvelope {
  if (!payload || typeof payload !== 'object') {
    return createApiErrorEnvelope(
      {
        message: DEFAULT_ERROR_MESSAGE,
        request_id: requestId,
      },
      status
    );
  }

  const candidate = payload as Record<string, unknown>;
  const nestedError =
    candidate.error && typeof candidate.error === 'object'
      ? (candidate.error as Record<string, unknown>)
      : null;

  return createApiErrorEnvelope(
    {
      message: getErrorMessage(candidate),
      error_code:
        typeof candidate.error_code === 'string'
          ? candidate.error_code
          : typeof nestedError?.code === 'string'
            ? nestedError.code
            : undefined,
      data: candidate.data,
      details: candidate.details ?? nestedError?.details,
      retryable:
        typeof candidate.retryable === 'boolean'
          ? candidate.retryable
          : typeof nestedError?.retryable === 'boolean'
            ? nestedError.retryable
            : undefined,
      retry_after_seconds:
        typeof candidate.retry_after_seconds === 'number'
          ? candidate.retry_after_seconds
          : typeof nestedError?.retry_after_seconds === 'number'
            ? nestedError.retry_after_seconds
            : undefined,
      request_id:
        typeof candidate.request_id === 'string'
          ? candidate.request_id
          : typeof nestedError?.request_id === 'string'
            ? nestedError.request_id
            : requestId,
    },
    status
  );
}
