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

async function safeText(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    const trimmed = text.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

function parseJsonRecord(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed as JsonRecord;
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

export async function readApiErrorBody(
  res: Response
): Promise<JsonRecord | null> {
  const jsonSource = typeof res.clone === 'function' ? res.clone() : res;
  const jsonBody = await safeJson(jsonSource);
  if (jsonBody) {
    return jsonBody;
  }

  if (jsonSource === res) {
    return null;
  }

  const text = await safeText(res);
  if (!text) {
    return null;
  }

  const parsed = parseJsonRecord(text);
  if (parsed) {
    return parsed;
  }

  return { message: text };
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

export async function createApiResponseErrorFromResponse(
  res: Response,
  fallbackMessage: string
): Promise<ApiResponseError> {
  const body = await readApiErrorBody(res);

  return createApiResponseError(body, {
    status: res.status,
    fallbackMessage,
  });
}

export async function handleApiResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  if (!res.ok) {
    const body = await readApiErrorBody(res);
    throw createApiResponseError(body, {
      status: res.status,
      fallbackMessage,
    });
  }

  const body = await safeJson(res);

  if (body && 'data' in body) {
    return (body.data as T) ?? (null as T);
  }

  return null as T;
}
