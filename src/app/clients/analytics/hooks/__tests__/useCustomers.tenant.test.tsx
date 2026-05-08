import { renderHook, act, waitFor } from '@/test-utils/render';
import { useCustomers } from '../useCustomers';
import { apiFetch } from '@/utils/apiFetch';

let mockTenantIdentityKey = 'tenant-a';
const mockHandleError = jest.fn();

const mockClients = [
  {
    id: 'c1',
    first_name: 'Jane',
    last_name: 'Kim',
    email: 'jane@example.com',
    tags: ['VIP'],
    created_at: '2024-01-01',
  },
  {
    id: 'c2',
    first_name: 'Minho',
    last_name: 'Lee',
    email: 'minho@example.com',
    tags: ['Musician'],
    created_at: '2024-02-01',
  },
];

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedClients: () => ({
    clients: mockClients,
    loading: false,
  }),
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({
    tenantIdentityKey: mockTenantIdentityKey,
  }),
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function summaryResponse(clientId: string, total: number): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          client_id: clientId,
          total_spend: total,
          purchase_count: 1,
          last_purchase_date: '2024-05-12',
          first_purchase_date: '2024-05-12',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
}

describe('useCustomers tenant safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantIdentityKey = 'tenant-a';
  });

  it('clears old cached summaries and ignores late old-tenant responses', async () => {
    const tenantA = deferred<Response>();
    const tenantB = deferred<Response>();
    (apiFetch as jest.Mock)
      .mockReturnValueOnce(tenantA.promise)
      .mockReturnValueOnce(tenantB.promise);

    const { result, rerender } = renderHook(() => useCustomers());

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    mockTenantIdentityKey = 'tenant-b';
    await act(async () => {
      rerender();
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      tenantA.resolve(summaryResponse('c1', 111));
      await tenantA.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      result.current.rawCustomers.find(customer => customer.id === 'c1')
        ?.totalSpend
    ).toBe(0);

    await act(async () => {
      tenantB.resolve(summaryResponse('c2', 222));
      await tenantB.promise;
    });

    await waitFor(() => {
      expect(
        result.current.rawCustomers.find(customer => customer.id === 'c2')
          ?.totalSpend
      ).toBe(222);
    });

    expect(
      result.current.rawCustomers.find(customer => customer.id === 'c1')
        ?.totalSpend
    ).toBe(0);
  });

  it('preserves failed analytics response metadata through handleError', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'ANALYTICS_UNAVAILABLE',
            message: 'Analytics temporarily unavailable',
            details: { source: 'summary-by-client' },
            retryable: true,
            request_id: 'req-analytics-1',
          },
        }),
        {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useCustomers());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ApiResponseError',
        message: 'Analytics temporarily unavailable',
        status: 503,
        error_code: 'ANALYTICS_UNAVAILABLE',
        retryable: true,
        details: { source: 'summary-by-client' },
        request_id: 'req-analytics-1',
      }),
      'Failed to fetch sales history'
    );
  });
});
