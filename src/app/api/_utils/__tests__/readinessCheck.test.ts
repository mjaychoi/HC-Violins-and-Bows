/** @jest-environment node */

import {
  checkRuntimeConfiguration,
  runReadinessChecks,
  type CheckOutcome,
  type ReadinessDependencies,
} from '../readinessCheck';
import { BoundedTimeoutError } from '../withBoundedTimeout';

function ok(code: CheckOutcome['code'] = 'ok'): CheckOutcome {
  return { status: 'ok', code, durationMs: 1 };
}

function failed(
  code: CheckOutcome['code'],
  status: CheckOutcome['status'] = 'failed'
): CheckOutcome {
  return { status, code, durationMs: 1 };
}

function deps(
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

describe('checkRuntimeConfiguration', () => {
  const valid = {
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };

  it('passes when required supabase and storage config are present', () => {
    expect(checkRuntimeConfiguration({ env: valid }).status).toBe('ok');
  });

  it('fails closed when the supabase URL is missing', () => {
    const result = checkRuntimeConfiguration({
      env: { ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined },
    });
    expect(result.status).toBe('failed');
    expect(result.code).toBe('missing_supabase_url');
  });

  it('fails closed when the supabase URL is not http(s)', () => {
    const result = checkRuntimeConfiguration({
      env: { ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' },
    });
    expect(result.status).toBe('failed');
    expect(result.code).toBe('invalid_supabase_url');
  });

  it('fails closed when the anon key is missing', () => {
    const result = checkRuntimeConfiguration({
      env: { ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
    });
    expect(result.status).toBe('failed');
    expect(result.code).toBe('missing_supabase_anon_key');
  });

  it('fails closed when the service role key is missing', () => {
    const result = checkRuntimeConfiguration({
      env: { ...valid, SUPABASE_SERVICE_ROLE_KEY: undefined },
    });
    expect(result.status).toBe('failed');
    expect(result.code).toBe('missing_service_role_key');
  });

  it('fails closed when production storage config is invalid', () => {
    const result = checkRuntimeConfiguration({
      env: {
        ...valid,
        NODE_ENV: 'production',
        STORAGE_TYPE: 'local',
      },
    });
    expect(result.status).toBe('failed');
    expect(result.code).toBe('invalid_storage_config');
  });
});

describe('runReadinessChecks orchestration', () => {
  it('STATE A: healthy dependencies are ready', async () => {
    const result = await runReadinessChecks({}, deps());
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual({
      configuration: 'ok',
      database: 'ok',
      schema: 'ok',
    });
  });

  it('STATE B: database unreachable is not ready and skips schema', async () => {
    const schema = jest.fn();
    const result = await runReadinessChecks(
      {},
      deps({
        pingDatabase: jest
          .fn()
          .mockResolvedValue(failed('database_unreachable')),
        checkSchema: schema,
      })
    );

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({
      configuration: 'ok',
      database: 'failed',
      schema: 'unknown',
    });
    expect(schema).not.toHaveBeenCalled();
  });

  it('STATE C: schema mismatch is not ready', async () => {
    const result = await runReadinessChecks(
      {},
      deps({
        checkSchema: jest.fn().mockResolvedValue(failed('schema_mismatch')),
      })
    );

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({
      configuration: 'ok',
      database: 'ok',
      schema: 'failed',
    });
    expect(result.codes.schema).toBe('schema_mismatch');
  });

  it('STATE D: invalid runtime config is not ready and skips IO', async () => {
    const pingDatabase = jest.fn();
    const checkSchema = jest.fn();
    const result = await runReadinessChecks(
      {},
      deps({
        checkConfiguration: () => failed('missing_supabase_url'),
        pingDatabase,
        checkSchema,
      })
    );

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({
      configuration: 'failed',
      database: 'unknown',
      schema: 'unknown',
    });
    expect(pingDatabase).not.toHaveBeenCalled();
    expect(checkSchema).not.toHaveBeenCalled();
  });

  it('returns not-ready on per-check timeout without crashing', async () => {
    const result = await runReadinessChecks(
      {},
      deps({
        pingDatabase: () =>
          new Promise(() => {
            /* hang */
          }),
        checkTimeoutMs: 20,
        timeoutMs: 200,
      })
    );

    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.checks.database).toBe('failed');
    expect(result.codes.database).toBe('timeout');
    expect(result.checks.schema).toBe('unknown');
  });

  it('maps thrown BoundedTimeoutError from a check to timeout', async () => {
    const result = await runReadinessChecks(
      {},
      deps({
        pingDatabase: async () => {
          throw new BoundedTimeoutError('database');
        },
      })
    );

    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.codes.database).toBe('timeout');
  });
});
