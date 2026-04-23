import { GET } from '../route';

// Mock healthCheck
jest.mock('@/app/api/_utils/healthCheck', () => ({
  checkMigrations: jest.fn().mockResolvedValue({
    display_order: true,
    allHealthy: true,
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

    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.checks?.forbiddenPoliciesAbsent).toBe(true);
    expect(body.checks?.instrument_api_contract?.ok).toBe(true);
    expect(body.checks?.instrument_api_contract?.missing).toEqual([]);
  });
});
