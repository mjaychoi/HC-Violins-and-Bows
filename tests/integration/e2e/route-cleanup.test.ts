/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import {
  withRouteCleanup,
  type RouteCleanupPage,
  type RouteCleanupResponse,
  type RouteCleanupTestInfo,
} from '../../e2e/route-cleanup';

type ScriptedDelete = {
  ok?: boolean;
  status?: number;
  body?: string;
  throwError?: unknown;
  textError?: unknown;
};

function scriptedPage(script: ScriptedDelete[]): {
  calls: string[];
  page: RouteCleanupPage;
} {
  const calls: string[] = [];
  let index = 0;
  return {
    calls,
    page: {
      request: {
        async delete(requestPath: string): Promise<RouteCleanupResponse> {
          calls.push(requestPath);
          const step = script[index];
          index += 1;
          if (!step) {
            throw new Error(`unexpected DELETE ${requestPath}`);
          }
          if (step.throwError) throw step.throwError;
          const status = step.status ?? (step.ok === false ? 500 : 200);
          const ok = step.ok ?? (status >= 200 && status < 300);
          return {
            ok: () => ok,
            status: () => status,
            text: async () => {
              if (step.textError) throw step.textError;
              return step.body ?? '';
            },
          };
        },
      },
    },
  };
}

function recordingInfo(): {
  attachments: Array<{ name: string; body: string }>;
  testInfo: RouteCleanupTestInfo;
} {
  const attachments: Array<{ name: string; body: string }> = [];
  return {
    attachments,
    testInfo: {
      async attach(name, options) {
        attachments.push({ name, body: options.body });
      },
    },
  };
}

describe('withRouteCleanup', () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('deletes newest resources first', async () => {
    const { calls, page } = scriptedPage([
      { status: 200 },
      { status: 204 },
      { status: 200 },
    ]);
    const { testInfo } = recordingInfo();

    await withRouteCleanup(page, testInfo, async cleanup => {
      cleanup.register('client', '/api/clients?id=client-1');
      cleanup.register('instrument', '/api/instruments?id=instrument-1');
      cleanup.register({
        label: 'invoice',
        path: '/api/invoices/invoice-1',
      });
    });

    expect(calls).toEqual([
      '/api/invoices/invoice-1',
      '/api/instruments?id=instrument-1',
      '/api/clients?id=client-1',
    ]);
  });

  it('runs every cleanup step when one fails', async () => {
    const { calls, page } = scriptedPage([
      { status: 500, body: 'invoice exploded' },
      { throwError: new Error('socket hang up') },
      { status: 200 },
    ]);
    const { testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
        cleanup.register('instrument', '/api/instruments?id=instrument-1');
        cleanup.register('invoice', '/api/invoices/invoice-1');
      })
    ).rejects.toThrow('Route cleanup failed:');

    expect(calls).toEqual([
      '/api/invoices/invoice-1',
      '/api/instruments?id=instrument-1',
      '/api/clients?id=client-1',
    ]);
  });

  it('accepts 2xx cleanup when the body passed', async () => {
    const { page } = scriptedPage([{ status: 200 }, { status: 204 }]);
    const { attachments, testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('/api/clients?id=client-1');
        cleanup.register('instrument', '/api/instruments?id=instrument-1');
      })
    ).resolves.toBeUndefined();

    expect(attachments).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fails the harness when cleanup returns a non-2xx and the body passed', async () => {
    const { page } = scriptedPage([
      { status: 500, body: 'instrument delete failed' },
    ]);
    const { attachments, testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('instrument', '/api/instruments?id=instrument-1');
      })
    ).rejects.toThrow(
      'instrument: DELETE /api/instruments?id=instrument-1 -> 500 instrument delete failed'
    );

    expect(attachments).toEqual([
      {
        name: 'route-cleanup-failures',
        body: expect.stringContaining('-> 500 instrument delete failed'),
      },
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('does not treat an unexpected 404 as cleanup success', async () => {
    const { page } = scriptedPage([{ status: 404, body: 'missing' }]);
    const { testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
      })
    ).rejects.toThrow('client: DELETE /api/clients?id=client-1 -> 404 missing');
  });

  it('fails the harness when a cleanup request throws and the body passed', async () => {
    const { page } = scriptedPage([
      { throwError: new Error('Bearer leaked-token socket hang up') },
    ]);
    const { testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
      })
    ).rejects.toThrow(
      'client: DELETE /api/clients?id=client-1 -> threw Bearer [redacted] socket hang up'
    );
  });

  it('aggregates every cleanup failure', async () => {
    const { page } = scriptedPage([
      { status: 500, body: 'invoice down' },
      { status: 401, body: 'unauthorized' },
    ]);
    const { testInfo } = recordingInfo();

    const error = await withRouteCleanup(page, testInfo, async cleanup => {
      cleanup.register('client', '/api/clients?id=client-1');
      cleanup.register('invoice', '/api/invoices/invoice-1');
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      [
        'Route cleanup failed:',
        'invoice: DELETE /api/invoices/invoice-1 -> 500 invoice down',
        'client: DELETE /api/clients?id=client-1 -> 401 unauthorized',
      ].join('\n')
    );
  });

  it('release prevents a successfully deleted resource from being deleted again', async () => {
    const { calls, page } = scriptedPage([{ status: 200 }, { status: 200 }]);
    const { testInfo } = recordingInfo();

    await withRouteCleanup(page, testInfo, async cleanup => {
      cleanup.register('client', '/api/clients?id=client-1');
      cleanup.register('instrument', '/api/instruments?id=instrument-1');
      cleanup.register('invoice', '/api/invoices/invoice-1');
      cleanup.register('invoice', '/api/invoices/invoice-1');
      cleanup.release('/api/invoices/invoice-1');
    });

    expect(calls).toEqual([
      '/api/instruments?id=instrument-1',
      '/api/clients?id=client-1',
    ]);
  });

  it('preserves the original body error when cleanup succeeds', async () => {
    const bodyError = new Error('sale assertion failed');
    const { page } = scriptedPage([{ status: 200 }]);
    const { attachments, testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
        throw bodyError;
      })
    ).rejects.toBe(bodyError);

    expect(attachments).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('preserves the original body error and reports cleanup separately', async () => {
    const bodyError = new Error('sale assertion failed');
    const { calls, page } = scriptedPage([
      { status: 500, body: 'still there' },
      { status: 401, body: 'no session' },
    ]);
    const { attachments, testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
        cleanup.register('invoice', '/api/invoices/invoice-1');
        throw bodyError;
      })
    ).rejects.toBe(bodyError);

    expect(calls).toEqual([
      '/api/invoices/invoice-1',
      '/api/clients?id=client-1',
    ]);
    const summary = [
      'Route cleanup failed:',
      'invoice: DELETE /api/invoices/invoice-1 -> 500 still there',
      'client: DELETE /api/clients?id=client-1 -> 401 no session',
    ].join('\n');
    expect(consoleError).toHaveBeenCalledWith(summary);
    expect(attachments).toEqual([
      { name: 'route-cleanup-failures', body: summary },
    ]);
    expect(bodyError.message).toBe('sale assertion failed');
  });

  it('bounds and redacts cleanup response snippets', async () => {
    const token = 'super-secret-token-value';
    const body = `Bearer ${token} password="hunter2" AKIAIOSFODNN7EXAMPLE cookie: session=abc\n${'x'.repeat(500)} TAIL_MARKER`;
    const { page } = scriptedPage([{ status: 500, body }]);
    const { attachments, testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
      })
    ).rejects.toThrow(/Bearer \[redacted\]/);

    const attached = attachments[0]?.body ?? '';
    expect(attached).toContain('Bearer [redacted]');
    expect(attached).toContain('password="[redacted]');
    expect(attached).toContain('cookie: [redacted]');
    expect(attached).toContain('[redacted-aws-key]');
    expect(attached).not.toContain(token);
    expect(attached).not.toContain('hunter2');
    expect(attached).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(attached).not.toContain('TAIL_MARKER');
    expect(attached.length).toBeLessThan(600);
  });

  it('keeps going when a failure body cannot be read', async () => {
    const { calls, page } = scriptedPage([
      { status: 500, textError: new Error('body stream closed') },
      { status: 200 },
    ]);
    const { testInfo } = recordingInfo();

    await expect(
      withRouteCleanup(page, testInfo, async cleanup => {
        cleanup.register('client', '/api/clients?id=client-1');
        cleanup.register('invoice', '/api/invoices/invoice-1');
      })
    ).rejects.toThrow('body unreadable (body stream closed)');

    expect(calls).toHaveLength(2);
  });
});

describe('critical-path cleanup wiring', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'tests/e2e/critical-path.spec.ts'),
    'utf8'
  );

  it('does not swallow route DELETE failures', () => {
    expect(source).not.toMatch(/\.catch\(\(\)\s*=>\s*undefined\)/);
    expect(source).toContain('withRouteCleanup');
    expect(source).toContain("cleanup.register('client'");
    expect(source).toContain("cleanup.register('instrument'");
    expect(source).toContain("cleanup.register('invoice'");
    expect(source).toContain('cleanup.release(');
  });
});
