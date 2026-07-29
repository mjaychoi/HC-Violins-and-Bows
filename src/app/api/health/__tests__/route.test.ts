import { GET } from '../route';
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

describe('/api/health', () => {
  it('returns ok with metadata', async () => {
    const res = await GET();
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

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.diagnostics).toEqual({ catalogAccessFailed: true });
    expect(JSON.stringify(body)).not.toMatch(/postgres/i);
    expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL/i);
  });
});
