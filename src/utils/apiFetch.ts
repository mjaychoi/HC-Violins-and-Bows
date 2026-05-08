type ApiFetchOptions = {
  public?: boolean;
  idempotencyKey?: string;
};

type RequestScope = 'same-origin-api' | 'same-origin' | 'external';

export class ApiFetchError extends Error {
  code: 'AUTH' | 'NETWORK' | 'CLIENT';
  error_code?: string;
  retryable?: boolean;
  details?: unknown;
  request_id?: string;

  constructor(
    message: string,
    code: 'AUTH' | 'NETWORK' | 'CLIENT',
    options?: ErrorOptions & {
      error_code?: string;
      retryable?: boolean;
      details?: unknown;
      request_id?: string;
    }
  ) {
    super(message, options);
    this.name = 'ApiFetchError';
    this.code = code;
    this.error_code = options?.error_code;
    this.retryable = options?.retryable;
    this.details = options?.details;
    this.request_id = options?.request_id;
  }
}

export class ApiFetchAuthError extends ApiFetchError {
  status: number;

  constructor(
    message: string,
    status: number,
    options?: ErrorOptions & {
      error_code?: string;
      retryable?: boolean;
      details?: unknown;
      request_id?: string;
    }
  ) {
    super(message, 'AUTH', options);
    this.name = 'ApiFetchAuthError';
    this.status = status;
  }
}

export class ApiFetchNetworkError extends ApiFetchError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'NETWORK', options);
    this.name = 'ApiFetchNetworkError';
  }
}

export class ApiFetchClientError extends ApiFetchError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'CLIENT', options);
    this.name = 'ApiFetchClientError';
  }
}

function shouldSetJsonContentType(body: RequestInit['body']): boolean {
  if (!body) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
    return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer)
    return false;
  if (ArrayBuffer.isView(body)) return false;
  return typeof body === 'string';
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestScope(input: RequestInfo | URL): RequestScope {
  const rawUrl = getRequestUrl(input);

  if (rawUrl.startsWith('/')) {
    return rawUrl.startsWith('/api/') || rawUrl === '/api'
      ? 'same-origin-api'
      : 'same-origin';
  }

  if (typeof window === 'undefined') {
    return 'external';
  }

  try {
    const resolved = new URL(rawUrl, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      return 'external';
    }
    return resolved.pathname.startsWith('/api/')
      ? 'same-origin-api'
      : 'same-origin';
  } catch {
    return 'external';
  }
}

async function throwIfAuthFailure(
  response: Response,
  scope: RequestScope
): Promise<void> {
  if (scope !== 'same-origin-api') return;
  if (response.status !== 401 && response.status !== 403) return;

  let message = 'Authentication required';
  let error_code: string | undefined;
  let retryable: boolean | undefined;
  let details: unknown;
  let request_id = response.headers?.get('x-request-id')?.trim() || undefined;

  try {
    const clone = response.clone();
    const body = (await clone.json()) as Record<string, unknown>;
    const nestedError =
      body.error && typeof body.error === 'object'
        ? (body.error as Record<string, unknown>)
        : null;
    const candidate =
      body.message ??
      (typeof body.error === 'string' ? body.error : undefined) ??
      nestedError?.message;

    if (typeof candidate === 'string' && candidate.trim()) {
      message = candidate;
    }
    error_code =
      typeof body.error_code === 'string'
        ? body.error_code
        : typeof nestedError?.code === 'string'
          ? nestedError.code
          : typeof nestedError?.error_code === 'string'
            ? nestedError.error_code
            : undefined;
    retryable =
      typeof body.retryable === 'boolean'
        ? body.retryable
        : typeof nestedError?.retryable === 'boolean'
          ? nestedError.retryable
          : undefined;
    details = body.details ?? nestedError?.details;
    const bodyRequestId =
      typeof body.request_id === 'string' && body.request_id
        ? body.request_id
        : undefined;
    const nestedRequestId =
      typeof nestedError?.request_id === 'string' && nestedError.request_id
        ? nestedError.request_id
        : undefined;
    request_id = bodyRequestId ?? nestedRequestId ?? request_id;
  } catch {
    // Keep default message if the response body is not JSON.
  }

  throw new ApiFetchAuthError(message, response.status, {
    error_code,
    retryable,
    details,
    request_id,
  });
}

function classifyFetchError(error: unknown): never {
  if (error instanceof ApiFetchError) {
    throw error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    throw error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes('invalid url') ||
    lower.includes('failed to parse url') ||
    lower.includes('failed to construct') ||
    lower.includes('unsupported protocol')
  ) {
    throw new ApiFetchClientError(message, { cause: error });
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    throw new ApiFetchNetworkError(message, { cause: error });
  }

  throw new ApiFetchClientError(message, { cause: error });
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions
): Promise<Response> {
  const scope = getRequestScope(input);
  const headers = new Headers(init?.headers ?? undefined);

  if (options?.idempotencyKey && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  if (
    init?.body &&
    !headers.has('Content-Type') &&
    shouldSetJsonContentType(init.body)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const nextInit: RequestInit = {
    ...init,
  };

  if (
    scope !== 'external' &&
    options?.public !== true &&
    typeof nextInit.credentials === 'undefined'
  ) {
    nextInit.credentials = 'same-origin';
  }

  if (Array.from(headers.keys()).length > 0) {
    nextInit.headers = headers;
  }

  try {
    const response = await fetch(input, nextInit);
    await throwIfAuthFailure(response, scope);
    return response;
  } catch (error) {
    classifyFetchError(error);
  }
}
