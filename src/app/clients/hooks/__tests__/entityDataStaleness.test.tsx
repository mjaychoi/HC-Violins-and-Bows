import { act, renderHook, waitFor } from '@/test-utils/render';
import { useContactLogs } from '../useContactLogs';
import { useClientsContactInfo } from '../useClientsContactInfo';
import { useClientSalesData } from '../useClientKPIs';
import { useOwnedItems } from '../useOwnedItems';
import type { Client, ContactLog, Instrument, SalesHistory } from '@/types';

global.fetch = jest.fn();

const mockHandleError = jest.fn();
const mockLogError = jest.fn();

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

jest.mock('@/utils/logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: (url: string, options?: RequestInit) => fetch(url, options),
}));

const client1Logs: ContactLog[] = [
  {
    id: 'log-1',
    client_id: 'client-1',
    instrument_id: null,
    contact_type: 'phone',
    subject: 'Client 1',
    content: 'Client 1 log',
    contact_date: '2024-01-10',
    next_follow_up_date: null,
    follow_up_completed_at: null,
    purpose: 'inquiry',
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
    client: undefined,
    instrument: undefined,
  },
];

const client2Logs: ContactLog[] = [
  {
    ...client1Logs[0],
    id: 'log-2',
    client_id: 'client-2',
    subject: 'Client 2',
    content: 'Client 2 log',
    contact_date: '2024-02-10',
  },
];

const client1Sales: SalesHistory[] = [
  {
    id: 'sale-1',
    client_id: 'client-1',
    instrument_id: 'inst-1',
    sale_date: '2024-01-15',
    sale_price: 1000,
    notes: null,
    created_at: '2024-01-15T00:00:00Z',
    client: undefined,
    instrument: undefined,
  },
];

const client1: Client = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123',
  tags: [],
  interest: null,
  note: null,
  client_number: 'C1',
  created_at: '2024-01-01T00:00:00Z',
};

const client2: Client = {
  ...client1,
  id: 'client-2',
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane@example.com',
  client_number: 'C2',
};

const ownedItemsClient2: Instrument[] = [
  {
    id: 'inst-2',
    maker: 'Guarneri',
    type: 'Violin',
    subtype: null,
    year: 1740,
    certificate: false,
    size: null,
    weight: null,
    price: null,
    ownership: 'Jane Smith',
    note: null,
    serial_number: 'VI0000002',
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const ownedItemsClient1: Instrument[] = [
  {
    ...ownedItemsClient2[0],
    id: 'inst-1',
    maker: 'Stradivari',
    ownership: 'John Doe',
    serial_number: 'VI0000001',
  },
];

describe('entity async hook stale-state guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('useContactLogs resets and ignores stale responses when client changes', async () => {
    let resolveClient1: ((value: Response) => void) | undefined;

    (global.fetch as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            resolveClient1 = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: client2Logs }),
      } as Response);

    const { result, rerender } = renderHook(
      ({ clientId }) => useContactLogs({ clientId, autoFetch: true }),
      { initialProps: { clientId: 'client-1' } }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('loading');
      expect(result.current.contactLogs).toEqual([]);
    });

    rerender({ clientId: 'client-2' });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.contactLogs).toEqual(client2Logs);
    });

    await act(async () => {
      resolveClient1?.({
        ok: true,
        json: async () => ({ data: client1Logs }),
      } as Response);
    });

    expect(result.current.contactLogs).toEqual(client2Logs);
  });

  it('useClientsContactInfo clears stale data and surfaces error state on failed refetch', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: client1Logs }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'failed' }),
      } as Response);

    const { result, rerender } = renderHook(
      ({ clientIds }) => useClientsContactInfo({ clientIds, enabled: true }),
      { initialProps: { clientIds: ['client-1'] } }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.getContactInfo('client-1')).not.toBeNull();
    });

    rerender({ clientIds: ['client-2'] });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.contactInfoMap.size).toBe(0);
    });

    expect(result.current.getContactInfo('client-1')).toBeNull();
    expect(result.current.getContactInfo('client-2')).toBeNull();
  });

  it('useClientSalesData resets immediately and does not keep stale sales after failed entity switch', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: client1Sales }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'failed' }),
      } as Response);

    const { result, rerender } = renderHook(
      ({ clientId }) => useClientSalesData(clientId),
      { initialProps: { clientId: 'client-1' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.totalSpend).toBe(1000);
    });

    rerender({ clientId: 'client-2' });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.totalSpend).toBe(0);
      expect(result.current.purchaseCount).toBe(0);
      expect(result.current.lastPurchaseDate).toBe('—');
    });
  });

  it('useOwnedItems clears previous client data when next client fetch fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: ownedItemsClient1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'failed',
      } as Response);

    const { result } = renderHook(() => useOwnedItems());

    await act(async () => {
      await result.current.fetchOwnedItems(client1);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.ownedItems).toEqual(ownedItemsClient1);

    await act(async () => {
      await result.current.fetchOwnedItems(client2);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.ownedItems).toEqual([]);
    expect(mockLogError).toHaveBeenCalled();
  });
});
