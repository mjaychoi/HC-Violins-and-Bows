/** @jest-environment node */

import { EventEmitter } from 'events';

import {
  describeRequestUrl,
  formatRuntimeFailures,
  installCriticalRuntimeGuard,
  isUnexpectedApiServerError,
  sanitizeBodySnippet,
} from '../e2e/critical-runtime-guard';

const APP = 'http://127.0.0.1:3000';

function fakeResponse(options: {
  url: string;
  status: number;
  method?: string;
  contentType?: string;
  body?: string | Error;
  headers?: Record<string, string>;
}) {
  return {
    url: () => options.url,
    status: () => options.status,
    request: () => ({ method: () => options.method ?? 'GET' }),
    headers: () => ({
      'content-type': options.contentType ?? 'application/json',
      ...options.headers,
    }),
    text: async () => {
      if (options.body instanceof Error) throw options.body;
      return options.body ?? '';
    },
  };
}

function fakePage() {
  const emitter = new EventEmitter();
  return {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.off(event, handler);
    },
    emitter,
  };
}

function install() {
  const page = fakePage();
  // The guard only uses on/off; the fake implements exactly that surface.
  const guard = installCriticalRuntimeGuard(page as never, { appOrigin: APP });
  return { page, guard };
}

describe('isUnexpectedApiServerError', () => {
  it.each([500, 502, 503, 504])('flags same-origin /api %i', status => {
    expect(
      isUnexpectedApiServerError(`${APP}/api/connections`, status, APP)
    ).toBe(true);
  });

  it.each([200, 201, 304, 401, 403, 404, 409, 429])(
    'ignores same-origin /api %i',
    status => {
      expect(
        isUnexpectedApiServerError(`${APP}/api/clients`, status, APP)
      ).toBe(false);
    }
  );

  it.each([
    'https://www.hcviolins.com/logo.png',
    'https://cdn.jsdelivr.net/npm/x/api/y',
    'https://o1.ingest.sentry.io/api/123/envelope/',
    'https://abc.supabase.co/rest/v1/clients',
    'http://localhost:3000/api/clients', // different origin than 127.0.0.1
  ])('ignores cross-origin 500 %s', url => {
    expect(isUnexpectedApiServerError(url, 500, APP)).toBe(false);
  });

  it('ignores same-origin non-API paths and /api look-alikes', () => {
    expect(isUnexpectedApiServerError(`${APP}/dashboard`, 500, APP)).toBe(
      false
    );
    expect(isUnexpectedApiServerError(`${APP}/apix/foo`, 500, APP)).toBe(false);
  });

  it('is systemic, not tied to one endpoint', () => {
    for (const path of [
      '/api/clients',
      '/api/connections?pageSize=100&orderBy=created_at',
      '/api/instruments',
      '/api/invoices/abc/pdf',
      '/api/maintenance-tasks',
    ]) {
      expect(isUnexpectedApiServerError(`${APP}${path}`, 500, APP)).toBe(true);
    }
  });
});

describe('installCriticalRuntimeGuard', () => {
  it('fails on a same-origin /api 500 with method, status and path', async () => {
    const { page, guard } = install();
    page.emitter.emit(
      'response',
      fakeResponse({
        url: `${APP}/api/connections?pageSize=100&orderBy=created_at`,
        status: 500,
        headers: { 'x-request-id': 'req-123' },
        body: JSON.stringify({
          message: 'more than one relationship was found',
          error_code: 'PGRST201',
        }),
      })
    );

    await expect(guard.assertClean()).rejects.toThrow(
      /Unexpected same-origin API 500:\n {2}GET \/api\/connections\?pageSize=100&orderBy=created_at\n {2}x-request-id: req-123\n {2}body: .*PGRST201/
    );
    expect(guard.failures).toHaveLength(1);
  });

  it('ignores expected 4xx and cross-origin 500s', async () => {
    const { page, guard } = install();
    for (const status of [401, 403, 404, 409]) {
      page.emitter.emit(
        'response',
        fakeResponse({ url: `${APP}/api/clients?limit=1`, status })
      );
    }
    page.emitter.emit(
      'response',
      fakeResponse({ url: 'https://www.hcviolins.com/logo.png', status: 500 })
    );

    await expect(guard.assertClean()).resolves.toBeUndefined();
    expect(guard.failures).toEqual([]);
  });

  it('fails on pageerror with message and stack', async () => {
    const { page, guard } = install();
    const error = new TypeError(
      "Cannot read properties of undefined (reading 'map')"
    );
    error.stack = `${error.name}: ${error.message}\n    at Dashboard (app.js:1:2)`;
    page.emitter.emit('pageerror', error);

    await expect(guard.assertClean()).rejects.toThrow(
      /pageerror: 1[\s\S]*TypeError: Cannot read properties of undefined \(reading 'map'\)[\s\S]*at Dashboard \(app\.js:1:2\)/
    );
  });

  it('records the failure even when reading the body throws', async () => {
    const { page, guard } = install();
    page.emitter.emit(
      'response',
      fakeResponse({
        url: `${APP}/api/instruments`,
        status: 503,
        method: 'POST',
        body: new Error('Target page, context or browser has been closed'),
      })
    );

    await expect(guard.assertClean()).rejects.toThrow(
      /Unexpected same-origin API 503:\n {2}POST \/api\/instruments/
    );
  });

  it('does not read binary bodies', async () => {
    const { page, guard } = install();
    const text = jest.fn(async () => '%PDF-1.7 binary');
    page.emitter.emit('response', {
      ...fakeResponse({ url: `${APP}/api/invoices/1/pdf`, status: 500 }),
      headers: () => ({ 'content-type': 'application/pdf' }),
      text,
    });

    await expect(guard.assertClean()).rejects.toThrow(
      /GET \/api\/invoices\/1\/pdf/
    );
    expect(text).not.toHaveBeenCalled();
    expect(guard.failures[0]).not.toHaveProperty('bodySnippet');
  });

  it('stops collecting after dispose and keeps guards isolated', async () => {
    const first = install();
    first.guard.dispose();
    first.guard.dispose(); // idempotent
    first.page.emitter.emit(
      'response',
      fakeResponse({ url: `${APP}/api/clients`, status: 500 })
    );
    first.page.emitter.emit('pageerror', new Error('late'));
    expect(first.page.emitter.listenerCount('response')).toBe(0);
    expect(first.page.emitter.listenerCount('pageerror')).toBe(0);
    await expect(first.guard.assertClean()).resolves.toBeUndefined();

    const a = install();
    const b = install();
    a.page.emitter.emit(
      'response',
      fakeResponse({ url: `${APP}/api/clients`, status: 500 })
    );
    expect(a.guard.failures).toHaveLength(1);
    expect(b.guard.failures).toHaveLength(0);
  });
});

describe('diagnostic sanitization', () => {
  it('redacts tokens and truncates huge bodies', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
    const snippet = sanitizeBodySnippet(
      JSON.stringify({
        access_token: 'abc123',
        auth: `Bearer ${jwt}`,
        note: 'x'.repeat(2000),
      })
    );
    expect(snippet).not.toContain('abc123');
    expect(snippet).not.toContain(jwt);
    expect(snippet).toContain('[redacted]');
    expect(snippet.length).toBeLessThan(600);
    expect(snippet.endsWith('[truncated]')).toBe(true);
  });

  it('redacts sensitive query parameters in the reported path', () => {
    expect(
      describeRequestUrl(`${APP}/api/x?id=1&access_token=secret-value`)
    ).toBe('/api/x?id=1&access_token=%5Bredacted%5D');
  });

  it('summarizes counts in the header', () => {
    expect(
      formatRuntimeFailures([
        { type: 'api-5xx', status: 500, method: 'GET', url: '/api/a' },
        { type: 'pageerror', message: 'Error: boom' },
      ])
    ).toMatch(/unexpected same-origin API 5xx: 1\n {2}pageerror: 1/);
  });
});
