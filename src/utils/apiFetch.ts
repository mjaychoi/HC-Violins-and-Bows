type ApiFetchOptions = {
  public?: boolean;
  idempotencyKey?: string;
};

type RequestScope = 'same-origin-api' | 'same-origin' | 'external';

export class ApiFetchError extends Error {
  code: 'AUTH' | 'NETWORK' | 'CLIENT';

  constructor(
    message: string,
    code: 'AUTH' | 'NETWORK' | 'CLIENT',
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ApiFetchError';
    this.code = code;
  }
}

export class ApiFetchAuthError extends ApiFetchError {
  status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
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

  try {
    const clone = response.clone();
    const body = (await clone.json()) as Record<string, unknown>;
    const candidate = body.message ?? body.error;
    if (typeof candidate === 'string' && candidate.trim()) {
      message = candidate;
    }
  } catch {
    // Keep default message if the response body is not JSON.
  }

  throw new ApiFetchAuthError(message, response.status);
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
