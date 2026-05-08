import { renderHook, act, waitFor } from '@/test-utils/render';
import { useClientKPIs } from '../useClientKPIs';
import { apiFetch } from '@/utils/apiFetch';
import type { Client } from '@/types';

let mockTenantIdentityKey = 'tenant-a';

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
      handleError: jest.fn(),
    }),
  };
});

const clients: Client[] = [
  {
    id: 'c1',
    first_name: 'Jane',
    last_name: 'Kim',
    email: 'jane@example.com',
    contact_number: '',
    tags: [],
    interest: '',
    note: '',
    client_number: null,
    created_at: '2024-01-01',
  },
  {
    id: 'c2',
    first_name: 'Minho',
    last_name: 'Lee',
    email: 'minho@example.com',
    contact_number: '',
    tags: [],
    interest: '',
    note: '',
    client_number: null,
    created_at: '2024-02-01',
  },
];

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

describe('useClientKPIs tenant safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantIdentityKey = 'tenant-a';
  });

  it('resets cache on tenant switch and ignores late old-tenant responses', async () => {
    const tenantA = deferred<Response>();
    const tenantB = deferred<Response>();
    (apiFetch as jest.Mock)
      .mockReturnValueOnce(tenantA.promise)
      .mockReturnValueOnce(tenantB.promise);

    const { result, rerender } = renderHook(() =>
      useClientKPIs(clients, { enabled: true })
    );

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

    expect(result.current.totalSpend).toBe(0);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      tenantB.resolve(summaryResponse('c2', 222));
      await tenantB.promise;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.totalSpend).toBe(222);
    });
  });
});
