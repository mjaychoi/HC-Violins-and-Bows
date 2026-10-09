/**
 * Route-level DELETE cleanup for critical E2E.
 *
 * Pending resources are deleted newest-first. Every registered step runs even
 * when one fails. A non-2xx response or a thrown request fails the test when
 * the body passed. When the body already failed, that original error is
 * rethrown and the cleanup summary is logged and attached separately.
 *
 * `release(path)` drops a resource the body already deleted successfully, so
 * cleanup does not delete it again. A 404 is not success: an unexpected
 * missing route stays visible.
 *
 * Failure text includes the label, method, path, status, and a short body
 * snippet. Request headers, cookies, and credential-shaped values are omitted.
 */

const SNIPPET_LIMIT = 400;
const CLEANUP_ATTACHMENT = 'route-cleanup-failures';

export type RouteCleanupResponse = {
  ok: () => boolean;
  status: () => number;
  text: () => Promise<string>;
};

export type RouteCleanupPage = {
  request: {
    delete(path: string): Promise<RouteCleanupResponse>;
  };
};

export type RouteCleanupTestInfo = {
  attach(
    name: string,
    options: { body: string; contentType: string }
  ): Promise<void> | void;
};

export type RouteCleanupTarget = {
  label?: string;
  path: string;
};

export type RouteCleanup = {
  register(target: string | RouteCleanupTarget, path?: string): void;
  release(path: string): void;
};

type PendingCleanup = {
  label?: string;
  method: 'DELETE';
  path: string;
};

function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
      '[redacted-jwt]'
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-aws-key]')
    .replace(/cookie:\s*[^\n]+/gi, 'cookie: [redacted]')
    .replace(
      /((?:password|passwd|secret|cookie|api[_-]?key|service[_-]?role|refresh[_-]?token|access[_-]?token|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]*/gi,
      '$1[redacted]'
    );
}

function boundSnippet(text: string): string {
  const redacted = redactSecrets(text);
  const bounded =
    redacted.length <= SNIPPET_LIMIT
      ? redacted
      : `${redacted.slice(0, SNIPPET_LIMIT)}…`;
  return bounded.replace(/\s+/g, ' ').trim();
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function formatFailure(step: PendingCleanup, detail: string): string {
  const prefix = step.label ? `${step.label}: ` : '';
  return `${prefix}${step.method} ${step.path} -> ${detail}`;
}

function assertPath(path: string): void {
  if (!path.trim()) {
    throw new Error('Route cleanup registration requires a path.');
  }
}

function pushStep(
  pending: PendingCleanup[],
  target: string | RouteCleanupTarget,
  path?: string
): void {
  if (typeof target === 'string' && path !== undefined) {
    assertPath(path);
    pending.push({ label: target, method: 'DELETE', path });
    return;
  }
  if (typeof target === 'string') {
    assertPath(target);
    pending.push({ method: 'DELETE', path: target });
    return;
  }
  assertPath(target.path);
  pending.push({
    label: target.label,
    method: 'DELETE',
    path: target.path,
  });
}

async function failureSnippet(response: RouteCleanupResponse): Promise<string> {
  try {
    return boundSnippet(await response.text());
  } catch (error) {
    return `body unreadable (${boundSnippet(errorDetail(error))})`;
  }
}

export async function withRouteCleanup<T>(
  page: RouteCleanupPage,
  testInfo: RouteCleanupTestInfo,
  body: (cleanup: RouteCleanup) => Promise<T>
): Promise<T> {
  const pending: PendingCleanup[] = [];
  const cleanup: RouteCleanup = {
    register(target, path) {
      pushStep(pending, target, path);
    },
    release(path) {
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (pending[index].path === path) pending.splice(index, 1);
      }
    },
  };

  let result: T | undefined;
  let bodyError: unknown;
  let bodyFailed = false;
  try {
    result = await body(cleanup);
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }

  const failures: string[] = [];
  for (const step of [...pending].reverse()) {
    try {
      const response = await page.request.delete(step.path);
      if (!response.ok()) {
        const snippet = await failureSnippet(response);
        failures.push(
          formatFailure(step, `${response.status()} ${snippet}`.trim())
        );
      }
    } catch (error) {
      failures.push(
        formatFailure(step, `threw ${boundSnippet(errorDetail(error))}`)
      );
    }
  }

  if (failures.length === 0) {
    if (bodyFailed) throw bodyError;
    return result as T;
  }

  const summary = `Route cleanup failed:\n${failures.join('\n')}`;
  if (bodyFailed) console.error(summary);
  try {
    await testInfo.attach(CLEANUP_ATTACHMENT, {
      body: summary,
      contentType: 'text/plain',
    });
  } catch {
    if (!bodyFailed) console.error(summary);
  }

  if (bodyFailed) throw bodyError;
  throw new Error(summary);
}
