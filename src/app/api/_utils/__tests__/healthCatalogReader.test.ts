/** @jest-environment node */

const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockEnd = jest.fn();
const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    end: mockEnd,
  })),
}));

import {
  HealthCatalogAccessError,
  closeHealthCatalogPoolForTests,
  readHealthCatalogSnapshot,
  resetHealthCatalogPoolForTests,
} from '../healthCatalogReader';

const SAMPLE_SNAPSHOT = {
  migrationVersions: ['00000000000000'],
  functions: [{ proname: 'org_id', prosrc: 'app_metadata org_id' }],
  policies: [],
  presentColumns: ['public.invoices.invoice_number'],
  runtimeContracts: {
    api_create_idempotency_exists: true,
    api_create_idempotency_columns_ok: true,
    api_create_idempotency_unique_ok: true,
    create_connection_atomic_hardened: true,
  },
};

function setupSuccessfulClient() {
  mockConnect.mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });

  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('supabase_migrations.schema_migrations')) {
      return {
        rows: SAMPLE_SNAPSHOT.migrationVersions.map(version => ({ version })),
      };
    }

    if (text.includes('FROM pg_proc')) {
      return { rows: SAMPLE_SNAPSHOT.functions };
    }

    if (text.includes('FROM pg_policies')) {
      return { rows: SAMPLE_SNAPSHOT.policies };
    }

    if (text.includes('FROM information_schema.columns')) {
      return {
        rows: SAMPLE_SNAPSHOT.presentColumns.map(column => {
          const [schema, table, columnName] = column.split('.');
          return {
            table_schema: schema,
            table_name: table,
            column_name: columnName,
          };
        }),
      };
    }

    if (text.includes('FROM public.runtime_contract_checks')) {
      return { rows: [SAMPLE_SNAPSHOT.runtimeContracts] };
    }

    return { rows: [] };
  });
}

describe('healthCatalogReader cache', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    jest.useRealTimers();
    await closeHealthCatalogPoolForTests();
    resetHealthCatalogPoolForTests();
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://health-cache-a@example.test:5432/db';
    setupSuccessfulClient();
  });

  afterAll(async () => {
    await closeHealthCatalogPoolForTests();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('deduplicates concurrent catalog reads into one execution', async () => {
    const requests = Array.from({ length: 20 }, () =>
      readHealthCatalogSnapshot({ policyNames: ['clients_select'] })
    );

    const results = await Promise.all(requests);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(20);
    for (const result of results) {
      expect(result.migrationVersions).toEqual(
        SAMPLE_SNAPSHOT.migrationVersions
      );
    }
  });

  it('serves cached success snapshots until TTL expires', async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 6, 29) });

    await readHealthCatalogSnapshot();
    await readHealthCatalogSnapshot();

    expect(mockConnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(29_999);
    await readHealthCatalogSnapshot();
    expect(mockConnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await readHealthCatalogSnapshot();
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache and pool when DATABASE_URL changes', async () => {
    await readHealthCatalogSnapshot();
    expect(mockConnect).toHaveBeenCalledTimes(1);

    process.env.DATABASE_URL = 'postgres://health-cache-b@example.test:5432/db';

    await readHealthCatalogSnapshot();
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('caches failures briefly without exposing connection details', async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 6, 29) });

    mockConnect.mockRejectedValueOnce(
      new Error('password authentication failed for user "secret"')
    );

    await expect(readHealthCatalogSnapshot()).rejects.toBeInstanceOf(
      HealthCatalogAccessError
    );
    await expect(readHealthCatalogSnapshot()).rejects.toBeInstanceOf(
      HealthCatalogAccessError
    );

    expect(mockConnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_999);
    await expect(readHealthCatalogSnapshot()).rejects.toBeInstanceOf(
      HealthCatalogAccessError
    );
    expect(mockConnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    mockConnect.mockRejectedValueOnce(new Error('still failing'));
    await expect(readHealthCatalogSnapshot()).rejects.toBeInstanceOf(
      HealthCatalogAccessError
    );
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
