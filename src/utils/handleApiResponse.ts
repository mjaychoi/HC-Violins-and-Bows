type JsonRecord = Record<string, unknown>;

export interface ApiErrorEnvelope {
  message: string;
  error_code?: string;
  retryable?: boolean;
  details?: unknown;
}

export class ApiResponseError extends Error {
  error_code?: string;
  retryable?: boolean;
  details?: unknown;
  status: number;

  constructor(
    message: string,
    options: {
      status: number;
      error_code?: string;
      retryable?: boolean;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = options.status;
    this.error_code = options.error_code;
    this.retryable = options.retryable;
    this.details = options.details;
  }
}

async function safeJson(res: Response): Promise<JsonRecord | null> {
  try {
    const json = await res.json();
    if (json && typeof json === 'object') {
      return json as JsonRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function parseApiErrorBody(
  body: JsonRecord | null,
  fallbackMessage: string
): ApiErrorEnvelope {
  const messageCandidate = body?.message ?? body?.error;
  const message =
    typeof messageCandidate === 'string' && messageCandidate.trim()
      ? messageCandidate
      : fallbackMessage;

  return {
    message,
    error_code:
      typeof body?.error_code === 'string' ? body.error_code : undefined,
    retryable:
      typeof body?.retryable === 'boolean' ? body.retryable : undefined,
    details: body?.details,
  };
}

function getHttpFallbackMessage(
  status: number,
  fallbackMessage: string
): string {
  if (status >= 500) {
    return 'Server error occurred. Please try again later.';
  }

  return fallbackMessage;
}

export function createApiResponseError(
  body: JsonRecord | null,
  options: {
    status: number;
    fallbackMessage: string;
  }
): ApiResponseError {
  const parsed = parseApiErrorBody(
    body,
    getHttpFallbackMessage(options.status, options.fallbackMessage)
  );

  return new ApiResponseError(parsed.message, {
    status: options.status,
    error_code: parsed.error_code,
    retryable: parsed.retryable,
    details: parsed.details,
  });
}

export async function handleApiResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  const body = await safeJson(res);

  if (!res.ok) {
    throw createApiResponseError(body, {
      status: res.status,
      fallbackMessage,
    });
  }

  if (body && 'data' in body) {
    return (body.data as T) ?? (null as T);
  }

  return null as T;
}
