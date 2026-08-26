/** @jest-environment node */

jest.mock('../schemaReadiness', () => ({
  checkSchemaReadiness: jest.fn(),
}));

jest.mock('@/app/api/instruments/_shared/instrumentApiContract', () => ({
  checkInstrumentApiContractAdmin: jest.fn(),
}));

jest.mock('../healthCheck', () => ({
  checkMigrations: jest.fn(),
}));

import { checkInstrumentApiContractAdmin } from '@/app/api/instruments/_shared/instrumentApiContract';
import { checkApplicationSchema } from '../readinessCheck';
import { checkSchemaReadiness } from '../schemaReadiness';

describe('checkApplicationSchema cache policy', () => {
  const mockedCheck = checkSchemaReadiness as jest.MockedFunction<
    typeof checkSchemaReadiness
  >;
  const mockedContract = checkInstrumentApiContractAdmin as jest.MockedFunction<
    typeof checkInstrumentApiContractAdmin
  >;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    mockedCheck.mockReset();
    mockedContract.mockReset();
    mockedCheck.mockResolvedValue({
      ready: true,
      checkedAt: '2026-01-01T00:00:00.000Z',
      missingColumns: [],
      missingContracts: [],
    });
    mockedContract.mockResolvedValue({ ok: true, missing: [] });
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('uses the bounded schema readiness cache instead of bypassing it', async () => {
    const result = await checkApplicationSchema();

    expect(result.status).toBe('ok');
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck.mock.calls[0]?.[0]?.bypassCache).not.toBe(true);
  });
});
