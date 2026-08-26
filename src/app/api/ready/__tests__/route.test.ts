/** @jest-environment node */

import { NextRequest } from 'next/server';
import { handleReadyGet } from '@/app/api/_utils/handleReadyGet';
import {
  type CheckOutcome,
  type ReadinessDependencies,
} from '@/app/api/_utils/readinessCheck';
import { requiresAuthSession } from '@/lib/protectedRoutePolicy';

function readyRequest(headers?: HeadersInit): NextRequest {
  return new NextRequest('http://localhost/api/ready', { headers });
}

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

function publicEnv(): NodeJS.ProcessEnv {
  return env({ NODE_ENV: 'production' });
}

function ok(): CheckOutcome {
  return { status: 'ok', code: 'ok', durationMs: 1 };
}

function failed(code: CheckOutcome['code']): CheckOutcome {
  return { status: 'failed', code, durationMs: 1 };
}

function testDeps(
  overrides: Partial<ReadinessDependencies> = {}
): ReadinessDependencies {
  return {
    checkConfiguration: jest.fn().mockResolvedValue(ok()),
    pingDatabase: jest.fn().mockResolvedValue(ok()),
    checkSchema: jest.fn().mockResolvedValue(ok()),
    timeoutMs: 200,
    checkTimeoutMs: 50,
    ...overrides,
  };
}

describe('/api/ready', () => {
  it('returns 200 with ready checks when dependencies are healthy', async () => {
    const res = await handleReadyGet(readyRequest(), publicEnv(), {
      deps: testDeps(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: 'ready',
      checks: {
        configuration: 'ok',
        database: 'ok',
        schema: 'ok',
      },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const res = await handleReadyGet(readyRequest(), publicEnv(), {
      deps: testDeps({
        pingDatabase: jest
          .fn()
          .mockResolvedValue(failed('database_unreachable')),
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.checks).toEqual({
      configuration: 'ok',
      database: 'failed',
      schema: 'unknown',
    });
  });

  it('returns 503 when schema is incompatible', async () => {
    const res = await handleReadyGet(readyRequest(), publicEnv(), {
      deps: testDeps({
        checkSchema: jest.fn().mockResolvedValue(failed('schema_mismatch')),
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.schema).toBe('failed');
  });

  it('returns 503 when required runtime config is invalid', async () => {
    const res = await handleReadyGet(readyRequest(), publicEnv(), {
      deps: testDeps({
        checkConfiguration: () => failed('missing_supabase_url'),
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.configuration).toBe('failed');
    expect(body.checks.database).toBe('unknown');
  });

  it('returns 503 on timeout', async () => {
    const res = await handleReadyGet(readyRequest(), publicEnv(), {
      deps: testDeps({
        pingDatabase: () => new Promise(() => undefined),
        checkTimeoutMs: 20,
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.checks.database).toBe('failed');
  });

  it('does not leak secrets or raw database errors in the public payload', async () => {
    const res = await handleReadyGet(
      readyRequest(),
      env({
        NODE_ENV: 'production',
        HEALTH_CHECK_SECRET: 'super-secret',
        DATABASE_URL: 'postgres://user:pass@db.internal:5432/app',
      }),
      {
        deps: testDeps({
          pingDatabase: jest
            .fn()
            .mockResolvedValue(failed('database_unreachable')),
        }),
      }
    );
    const serialized = JSON.stringify(await res.json());

    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('postgres://');
    expect(serialized).not.toContain('db.internal');
    expect(serialized).not.toMatch(/password/i);
    expect(serialized).not.toMatch(/SELECT /i);
  });

  it('includes sanitized diagnostic codes only when the operator secret matches', async () => {
    const SECRET = 'ready-secret';
    const res = await handleReadyGet(
      readyRequest({ Authorization: `Bearer ${SECRET}` }),
      env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: SECRET }),
      {
        deps: testDeps({
          pingDatabase: jest
            .fn()
            .mockResolvedValue(failed('database_unreachable')),
        }),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.diagnostics.codes.database).toBe('database_unreachable');
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('is not an authenticated page route in middleware policy', () => {
    expect(requiresAuthSession('/api/ready')).toBe(false);
    expect(requiresAuthSession('/api/health')).toBe(false);
  });
});
