/** @jest-environment node */

import { runPostDeploySynthetic } from '../synthetic';
import type { FetchLike } from '../types';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';

const env = {
  POSTDEPLOY_BASE_URL: 'https://staging.example.test',
  STAGING_APP_BASE_URL: 'https://staging.example.test',
  STAGING_SUPABASE_PROJECT_REF: stagingRef,
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  STAGING_SUPABASE_ANON_KEY: 'anon-key',
  SYNTHETIC_EMAIL: 'synthetic@example.test',
  SYNTHETIC_PASSWORD: 'super-secret-password',
};

const created = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Synthetic',
  last_name: 'synthetic-fixed',
  note: 'synthetic-fixed',
};

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function fixtureFetch(overrides?: {
  readyStatus?: number;
  readyBody?: unknown;
  readStatus?: number;
  createStatus?: number;
  createBody?: unknown;
  getCreatedStatus?: number;
  getCreatedBody?: unknown;
  deleteStatus?: number;
}): FetchLike {
  return jest.fn(async (input: string, init?: { method?: string }) => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/api/ready') {
      return jsonResponse(
        overrides?.readyStatus ?? 200,
        overrides?.readyBody ?? {
          status: 'ready',
          checks: { configuration: 'ok', database: 'ok', schema: 'ok' },
        }
      );
    }

    if (
      url.pathname === '/api/clients' &&
      method === 'GET' &&
      !url.searchParams.get('id')
    ) {
      return jsonResponse(overrides?.readStatus ?? 200, { data: [] });
    }

    if (url.pathname === '/api/clients' && method === 'POST') {
      return jsonResponse(
        overrides?.createStatus ?? 201,
        overrides?.createBody ?? { data: created }
      );
    }

    if (
      url.pathname === '/api/clients' &&
      method === 'GET' &&
      url.searchParams.get('id') === created.id
    ) {
      return jsonResponse(
        overrides?.getCreatedStatus ?? 200,
        overrides?.getCreatedBody ?? { data: created }
      );
    }

    if (
      url.pathname === '/api/clients' &&
      method === 'DELETE' &&
      url.searchParams.get('id') === created.id
    ) {
      return jsonResponse(overrides?.deleteStatus ?? 200, { success: true });
    }

    return jsonResponse(500, { error: 'unexpected fixture path' });
  });
}

const authenticate = jest.fn(async () => ({
  cookieHeader: 'hcv-sb-auth=session-cookie',
  orgId: 'org-1',
}));

describe('runPostDeploySynthetic', () => {
  it('happy path exits 0', async () => {
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch(),
      authenticate,
      randomId: () => 'fixed',
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toMatch(/readiness\.+\sPASS/);
    expect(result.summary).toMatch(/authentication\.+\sPASS/);
    expect(result.summary).toMatch(/authenticated read PASS/);
    expect(result.summary).toMatch(/create\.+\sPASS/);
    expect(result.summary).toMatch(/read-after-write\.+\sPASS/);
    expect(result.summary).toMatch(/cleanup\.+\sPASS/);
  });

  it('request timeout exits non-zero', async () => {
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: async () => {
        throw new Error('Request timeout');
      },
      authenticate,
      randomId: () => 'fixed',
    });
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'readiness')?.status).toBe(
      'FAIL'
    );
  });

  it('readiness failure exits non-zero', async () => {
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch({
        readyStatus: 503,
        readyBody: { status: 'not_ready' },
      }),
      authenticate,
      randomId: () => 'fixed',
    });
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'readiness')?.status).toBe(
      'FAIL'
    );
  });

  it('authentication failure exits non-zero', async () => {
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch(),
      authenticate: async () => {
        throw new Error('Synthetic sign-in failed.');
      },
      randomId: () => 'fixed',
    });
    expect(result.exitCode).toBe(1);
    expect(
      result.steps.find(step => step.name === 'authentication')?.status
    ).toBe('FAIL');
  });

  it('mutation failure exits non-zero', async () => {
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch({
        createStatus: 500,
        createBody: { error: 'nope' },
      }),
      authenticate,
      randomId: () => 'fixed',
    });
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'create')?.status).toBe(
      'FAIL'
    );
  });

  it('cleanup failure exits non-zero and reports the resource id', async () => {
    const logs: string[] = [];
    const result = await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch({ deleteStatus: 500 }),
      authenticate,
      randomId: () => 'fixed',
      logger: {
        info: message => logs.push(message),
        error: message => logs.push(message),
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'cleanup')?.status).toBe(
      'FAIL'
    );
    expect(result.steps.find(step => step.name === 'cleanup')?.resourceId).toBe(
      created.id
    );
    expect(logs.join('\n')).toContain(created.id);
  });

  it('non-allowlisted target exits non-zero', async () => {
    const result = await runPostDeploySynthetic(
      {
        ...env,
        STAGING_SUPABASE_URL: 'https://otherrefexample5678.supabase.co',
      },
      {
        fetchImpl: fixtureFetch(),
        authenticate,
        randomId: () => 'fixed',
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'allowlist')?.status).toBe(
      'FAIL'
    );
  });

  it('missing credentials exit non-zero', async () => {
    const result = await runPostDeploySynthetic(
      {
        ...env,
        SYNTHETIC_EMAIL: undefined,
        SYNTHETIC_PASSWORD: undefined,
        E2E_TEST_EMAIL: undefined,
        E2E_TEST_PASSWORD: undefined,
      },
      {
        fetchImpl: fixtureFetch(),
        authenticate,
        randomId: () => 'fixed',
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.steps.find(step => step.name === 'credentials')?.status).toBe(
      'FAIL'
    );
  });

  it('sends cookie-backed auth and never Authorization', async () => {
    const fetchImpl = fixtureFetch();
    await runPostDeploySynthetic(env, {
      fetchImpl,
      authenticate,
      randomId: () => 'fixed',
    });

    const calls = (fetchImpl as jest.Mock).mock.calls as Array<
      [string, { headers?: Record<string, string> } | undefined]
    >;
    const authed = calls.filter(([, init]) => init?.headers?.Cookie);
    expect(authed.length).toBeGreaterThan(0);
    for (const [, init] of authed) {
      expect(init?.headers?.Cookie).toBe('hcv-sb-auth=session-cookie');
      expect(init?.headers?.Authorization).toBeUndefined();
    }
  });

  it('does not print secret values', async () => {
    const logs: string[] = [];
    await runPostDeploySynthetic(env, {
      fetchImpl: fixtureFetch(),
      authenticate,
      randomId: () => 'fixed',
      logger: {
        info: message => logs.push(message),
        error: message => logs.push(message),
      },
    });

    const combined = logs.join('\n');
    expect(combined).not.toContain('super-secret-password');
    expect(combined).not.toContain('session-cookie');
    expect(combined).not.toContain('anon-key');
    expect(combined).not.toMatch(/Bearer /);
  });
});
