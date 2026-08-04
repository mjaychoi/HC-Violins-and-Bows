import { NextRequest } from 'next/server';
import { GET } from '../route';
import { canViewHealthDiagnostics } from '@/app/api/_utils/healthDiagnosticsAuth';
import { handleHealthGet } from '@/app/api/_utils/handleHealthGet';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

jest.mock('@/app/api/_utils/healthCheck', () => ({
  checkMigrations: jest.fn().mockResolvedValue({
    display_order: true,
    allHealthy: true,
    catalogAccessFailed: false,
    requiredColumnsPresent: true,
    runtimeContractsPresent: true,
    forbiddenPoliciesAbsent: true,
    missingRuntimeContracts: [],
    missingColumns: [],
    missingMigrationVersions: [],
  }),
}));

jest.mock('@/app/api/instruments/_shared/instrumentApiContract', () => {
  const actual = jest.requireActual<
    typeof import('@/app/api/instruments/_shared/instrumentApiContract')
  >('@/app/api/instruments/_shared/instrumentApiContract');
  return {
    ...actual,
    checkInstrumentApiContractAdmin: jest
      .fn()
      .mockResolvedValue({ ok: true, missing: [] }),
  };
});

function healthRequest(headers?: HeadersInit): NextRequest {
  return new NextRequest('http://localhost/api/health', { headers });
}

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe('/api/health', () => {
  const originalSecret = process.env.HEALTH_CHECK_SECRET;
  const SECRET = 'health-secret';

  beforeEach(() => {
    delete process.env.HEALTH_CHECK_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.HEALTH_CHECK_SECRET;
    } else {
      process.env.HEALTH_CHECK_SECRET = originalSecret;
    }
  });

  it('returns ok with diagnostics outside production when secret is unset', async () => {
    const res = await GET(healthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.checks?.forbiddenPoliciesAbsent).toBe(true);
    expect(body.checks?.runtime_contracts?.ok).toBe(true);
    expect(body.checks?.runtime_contracts?.missing).toEqual([]);
    expect(body.checks?.instrument_api_contract?.ok).toBe(true);
    expect(body.checks?.instrument_api_contract?.missing).toEqual([]);
  });

  it('returns 503 fail-closed when catalog access fails', async () => {
    (checkMigrations as jest.Mock).mockResolvedValueOnce({
      display_order: false,
      allHealthy: false,
      catalogAccessFailed: true,
      requiredColumnsPresent: false,
      runtimeContractsPresent: false,
      forbiddenPoliciesAbsent: false,
      missingRuntimeContracts: [],
      missingColumns: [],
      missingMigrationVersions: ['health_catalog_access_failed'],
    });

    const res = await GET(healthRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.diagnostics).toEqual({ catalogAccessFailed: true });
    expect(JSON.stringify(body)).not.toMatch(/postgres/i);
    expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL/i);
  });

  it('returns liveness-only payload in production without secret', async () => {
    const res = await handleHealthGet(
      healthRequest(),
      env({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_VERSION: '1.2.3-should-not-leak',
      })
    );
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
    expect(body.version).toBeUndefined();
    expect(body.checks).toBeUndefined();
    expect(body.diagnostics).toBeUndefined();
    expect(serialized).not.toContain('1.2.3-should-not-leak');
    expect(serialized).not.toMatch(/HEALTH_CHECK_SECRET/i);
    expect(serialized).not.toMatch(/DATABASE_URL/i);
  });

  it('returns diagnostics when bearer secret matches in production', async () => {
    const res = await handleHealthGet(
      healthRequest({ Authorization: `Bearer ${SECRET}` }),
      env({
        NODE_ENV: 'production',
        HEALTH_CHECK_SECRET: SECRET,
        NEXT_PUBLIC_APP_VERSION: '1.2.3',
      })
    );
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body.version).toBe('1.2.3');
    expect(body.checks?.instrument_api_contract?.ok).toBe(true);
    expect(body.diagnostics).toBeDefined();
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toMatch(/HEALTH_CHECK_SECRET/i);
  });

  describe('canViewHealthDiagnostics auth contract', () => {
    const productionEnv = env({
      NODE_ENV: 'production',
      HEALTH_CHECK_SECRET: SECRET,
    });

    it('fails closed when production has no secret', () => {
      expect(
        canViewHealthDiagnostics(
          healthRequest(),
          env({ NODE_ENV: 'production' })
        )
      ).toBe(false);
    });

    it('accepts exact Bearer secret only', () => {
      expect(
        canViewHealthDiagnostics(
          healthRequest({ Authorization: `Bearer ${SECRET}` }),
          productionEnv
        )
      ).toBe(true);
    });

    it('rejects wrong, partial, whitespace, and non-Bearer schemes', () => {
      const cases = [
        `Bearer wrong`,
        `Bearer ${SECRET.slice(0, 4)}`,
        `Bearer ${SECRET} `,
        `Bearer  ${SECRET}`,
        `bearer ${SECRET}`,
        `Basic ${SECRET}`,
        SECRET,
        '',
      ];

      for (const authorization of cases) {
        expect(
          canViewHealthDiagnostics(
            healthRequest(
              authorization ? { Authorization: authorization } : undefined
            ),
            productionEnv
          )
        ).toBe(false);
      }
    });

    it('trims env secret config but not request tokens', () => {
      expect(
        canViewHealthDiagnostics(
          healthRequest({ Authorization: `Bearer ${SECRET}` }),
          env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: `  ${SECRET}  ` })
        )
      ).toBe(true);

      expect(
        canViewHealthDiagnostics(
          healthRequest({ Authorization: `Bearer  ${SECRET}` }),
          env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: SECRET })
        )
      ).toBe(false);
    });
  });
});
