import type { Page, Response } from '@playwright/test';

/**
 * Critical E2E runtime guard.
 *
 * Critical tests assert the responses they request directly (page.request),
 * but the browser page also fires background requests (RootProviders,
 * DataInitializer, hooks) whose status no test asserts. Before PR #151,
 * GET /api/connections returned repeated 500s in CI while every critical
 * test stayed green. This guard records, per test:
 *
 *   - any same-origin `/api/**` response with HTTP status >= 500, and
 *   - any uncaught browser exception (`pageerror`).
 *
 * It deliberately ignores 4xx (401/403/404/409 are expected in some tests),
 * cross-origin requests (CDN, Sentry, Supabase, hcviolins.com assets), and
 * console.error output. Direct `page.request` calls go through Playwright's
 * APIRequestContext, which does not emit page `response` events, so they
 * stay governed by each test's explicit assertions.
 *
 * Listeners only collect; nothing is thrown from an event callback. The
 * owner calls assertClean() after the test body and dispose() afterwards.
 */

export type RuntimeFailure =
  | {
      type: 'api-5xx';
      status: number;
      method: string;
      url: string;
      requestId?: string;
      bodySnippet?: string;
    }
  | {
      type: 'pageerror';
      message: string;
      stack?: string;
    };

export interface CriticalRuntimeGuard {
  /** Live view of everything collected so far. */
  readonly failures: readonly RuntimeFailure[];
  /** Throws a diagnostic Error if any failure was collected. */
  assertClean(): Promise<void>;
  /** Detaches listeners. Safe to call more than once. */
  dispose(): void;
}

const BODY_SNIPPET_MAX_CHARS = 500;
const BODY_READ_TIMEOUT_MS = 2000;
const TEXTUAL_CONTENT_TYPE = /json|text\/|xml/i;
const SENSITIVE_QUERY_KEY = /token|secret|password|apikey|api_key|signature/i;

/**
 * True when a response belongs to this app's own API and is a server error.
 * `appOrigin` is the origin the app under test is served from (baseURL).
 */
export function isUnexpectedApiServerError(
  responseUrl: string,
  status: number,
  appOrigin: string
): boolean {
  if (status < 500) return false;
  let url: URL;
  try {
    url = new URL(responseUrl);
  } catch {
    return false;
  }
  if (url.origin !== appOrigin) return false;
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/** Same-origin path + query, with sensitive-looking query values redacted. */
export function describeRequestUrl(responseUrl: string): string {
  try {
    const url = new URL(responseUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key))
        url.searchParams.set(key, '[redacted]');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return responseUrl;
  }
}

/** Truncate and strip token-like material from a response body excerpt. */
export function sanitizeBodySnippet(body: string): string {
  const redacted = body
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted-jwt]')
    .replace(/(bearer\s+)[\w.~+/=-]+/gi, '$1[redacted]')
    .replace(
      /("?(?:access_token|refresh_token|token|secret|password|apikey|api_key|authorization)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi,
      '$1"[redacted]"'
    )
    .replace(/\s+/g, ' ')
    .trim();
  return redacted.length > BODY_SNIPPET_MAX_CHARS
    ? `${redacted.slice(0, BODY_SNIPPET_MAX_CHARS)}… [truncated]`
    : redacted;
}

export function formatRuntimeFailures(
  failures: readonly RuntimeFailure[]
): string {
  const apiFailures = failures.filter(f => f.type === 'api-5xx');
  const pageErrors = failures.filter(f => f.type === 'pageerror');
  const lines = [
    'Critical E2E runtime guard detected incidental failures',
    `  unexpected same-origin API 5xx: ${apiFailures.length}`,
    `  pageerror: ${pageErrors.length}`,
  ];
  for (const failure of failures) {
    lines.push('');
    if (failure.type === 'api-5xx') {
      lines.push(`Unexpected same-origin API ${failure.status}:`);
      lines.push(`  ${failure.method} ${failure.url}`);
      if (failure.requestId) lines.push(`  x-request-id: ${failure.requestId}`);
      if (failure.bodySnippet) lines.push(`  body: ${failure.bodySnippet}`);
    } else {
      lines.push('Uncaught browser exception (pageerror):');
      lines.push(`  ${failure.message}`);
      if (failure.stack) {
        const frames = failure.stack
          .split('\n')
          .map(stackLine => stackLine.trim())
          .filter(stackLine => stackLine && stackLine !== failure.message);
        for (const frame of frames.slice(0, 15)) {
          lines.push(`    ${frame}`);
        }
      }
    }
  }
  return lines.join('\n');
}

async function readBodySnippet(
  response: Response
): Promise<string | undefined> {
  const contentType = response.headers()['content-type'] ?? '';
  if (!TEXTUAL_CONTENT_TYPE.test(contentType)) return undefined;
  const text = await response.text();
  return sanitizeBodySnippet(text);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}

export function installCriticalRuntimeGuard(
  page: Pick<Page, 'on' | 'off'>,
  options: { appOrigin: string }
): CriticalRuntimeGuard {
  const appOrigin = new URL(options.appOrigin).origin;
  const failures: RuntimeFailure[] = [];
  // Body excerpts are diagnostics only: a failed or slow read leaves the
  // snippet empty but never removes or downgrades the recorded failure.
  const pendingBodyReads: Promise<void>[] = [];

  const onResponse = (response: Response) => {
    const status = response.status();
    if (!isUnexpectedApiServerError(response.url(), status, appOrigin)) {
      return;
    }
    const failure: Extract<RuntimeFailure, { type: 'api-5xx' }> = {
      type: 'api-5xx',
      status,
      method: response.request().method(),
      url: describeRequestUrl(response.url()),
      requestId: response.headers()['x-request-id'],
    };
    failures.push(failure);
    pendingBodyReads.push(
      withTimeout(readBodySnippet(response), BODY_READ_TIMEOUT_MS).then(
        snippet => {
          if (snippet) failure.bodySnippet = snippet;
        }
      )
    );
  };

  const onPageError = (error: Error) => {
    failures.push({
      type: 'pageerror',
      message: `${error.name ? `${error.name}: ` : ''}${error.message}`,
      stack: error.stack,
    });
  };

  page.on('response', onResponse);
  page.on('pageerror', onPageError);
  let disposed = false;

  return {
    get failures() {
      return failures;
    },
    async assertClean() {
      await Promise.all(pendingBodyReads);
      if (failures.length > 0) {
        throw new Error(formatRuntimeFailures(failures));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      page.off('response', onResponse);
      page.off('pageerror', onPageError);
    },
  };
}
