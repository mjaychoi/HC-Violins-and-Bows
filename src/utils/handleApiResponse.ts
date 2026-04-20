type JsonRecord = Record<string, unknown>;

type ApiSuccessEnvelope<T> = JsonRecord & {
  data: T;
};

export interface ApiErrorEnvelope {
  message: string;
  error_code?: string;
  retryable?: boolean;
  details?: unknown;
  request_id?: string;
}

export class ApiResponseError extends Error {
  error_code?: string;
  retryable?: boolean;
  details?: unknown;
  request_id?: string;
  status: number;

  constructor(
    message: string,
    options: {
      status: number;
      error_code?: string;
      retryable?: boolean;
      details?: unknown;
      request_id?: string;
    }
  ) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = options.status;
    this.error_code = options.error_code;
    this.retryable = options.retryable;
    this.details = options.details;
    this.request_id = options.request_id;
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

function getContentType(res: Response): string {
  return res.headers?.get('content-type')?.toLowerCase() ?? '';
}

function getRequestId(res: Response): string | undefined {
  const value = res.headers?.get('x-request-id')?.trim();
  return value || undefined;
}

function isJsonContentType(contentType: string): boolean {
  return (
    contentType.includes('application/json') || contentType.includes('+json')
  );
}

/** Next.js / proxy HTML error pages are not user-facing API errors */
function isLikelyHtmlPayload(text: string): boolean {
  const normalized = text.trimStart().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

function htmlErrorFallbackMessage(): string {
  return 'The server returned an unexpected response. Please try again.';
}

function invalidResponseFallbackMessage(): string {
  return 'The server returned an unexpected response. Please try again.';
}

function getNestedError(body: JsonRecord | null): JsonRecord | null {
  if (!body?.error || typeof body.error !== 'object') {
    return null;
  }

  return body.error as JsonRecord;
}

function parseApiErrorBody(
  body: JsonRecord | null,
  fallbackMessage: string
): ApiErrorEnvelope {
  const nestedError = getNestedError(body);
  const messageCandidate =
    body?.message ??
    (typeof body?.error === 'string' ? body.error : undefined) ??
    nestedError?.message;
  const message =
    typeof messageCandidate === 'string' && messageCandidate.trim()
      ? messageCandidate
      : fallbackMessage;

  return {
    message,
    error_code:
      typeof body?.error_code === 'string'
        ? body.error_code
        : typeof nestedError?.code === 'string'
          ? nestedError.code
          : undefined,
    retryable:
      typeof body?.retryable === 'boolean'
        ? body.retryable
        : typeof nestedError?.retryable === 'boolean'
          ? nestedError.retryable
          : undefined,
    details: body?.details ?? nestedError?.details,
    request_id:
      typeof body?.request_id === 'string'
        ? body.request_id
        : typeof nestedError?.request_id === 'string'
          ? nestedError.request_id
          : undefined,
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

function createInvalidResponseError(
  res: Response,
  message: string = invalidResponseFallbackMessage()
): ApiResponseError {
  return new ApiResponseError(message, {
    status: res.status >= 400 ? res.status : 502,
    error_code: 'INVALID_RESPONSE',
    retryable: true,
    request_id: getRequestId(res),
  });
}

async function readJsonRecordResponse(res: Response): Promise<{
  body: JsonRecord | null;
  text: string | null;
  contentType: string;
}> {
  const contentType = getContentType(res);
  const clone = typeof res.clone === 'function' ? res.clone() : null;

  if (clone) {
    const jsonBody = await safeJson(clone);
    if (jsonBody) {
      return {
        body: jsonBody,
        text: null,
        contentType,
      };
    }
  } else {
    const jsonBody = await safeJson(res);
    if (jsonBody) {
      return {
        body: jsonBody,
        text: null,
        contentType,
      };
    }
  }

  const text = await safeText(res);
  if (!text) {
    return {
      body: null,
      text: null,
      contentType,
    };
  }

  const parsed = parseJsonRecord(text);
  if (parsed) {
    return {
      body: parsed,
      text,
      contentType,
    };
  }

  return {
    body: null,
    text,
    contentType,
  };
}

export async function readApiErrorBody(
  res: Response
): Promise<JsonRecord | null> {
  const { body, text, contentType } = await readJsonRecordResponse(res);

  if (body) {
    return body;
  }

  if (!text) {
    return null;
  }

  if (contentType.includes('text/html') || isLikelyHtmlPayload(text)) {
    return { message: htmlErrorFallbackMessage() };
  }

  return { message: text };
}

export function createApiResponseError(
  body: JsonRecord | null,
  options: {
    status: number;
    fallbackMessage: string;
    requestId?: string;
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
    request_id: parsed.request_id ?? options.requestId,
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
    requestId: getRequestId(res),
  });
}

async function readApiSuccessBody(res: Response): Promise<JsonRecord | null> {
  if (res.status === 204 || res.status === 205) {
    return null;
  }

  const { body, text, contentType } = await readJsonRecordResponse(res);

  if (body) {
    return body;
  }

  if (!text) {
    throw createInvalidResponseError(res);
  }

  if (contentType.includes('text/html') || isLikelyHtmlPayload(text)) {
    throw createInvalidResponseError(res, htmlErrorFallbackMessage());
  }

  if (!isJsonContentType(contentType)) {
    throw createInvalidResponseError(res);
  }

  throw createInvalidResponseError(res);
}

export async function readApiResponseEnvelope<T>(
  res: Response,
  fallbackMessage: string
): Promise<ApiSuccessEnvelope<T>> {
  if (!res.ok) {
    throw await createApiResponseErrorFromResponse(res, fallbackMessage);
  }

  const body = await readApiSuccessBody(res);

  if (!body || !('data' in body)) {
    throw createInvalidResponseError(res);
  }

  return body as ApiSuccessEnvelope<T>;
}

export async function handleApiResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  if (!res.ok) {
    throw await createApiResponseErrorFromResponse(res, fallbackMessage);
  }

  const body = await readApiSuccessBody(res);

  if (body && 'data' in body) {
    return (body.data as T) ?? (null as T);
  }

  if (body?.success === true) {
    return null as T;
  }

  if (body === null && (res.status === 204 || res.status === 205)) {
    return null as T;
  }

  throw createInvalidResponseError(res);
}
