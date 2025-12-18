import { renderHook, waitFor } from '@/test-utils/render';
import { useClientKPIs, useClientSalesData } from '../useClientKPIs';
import { Client, SalesHistory } from '@/types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock useErrorHandler
const mockHandleError = jest.fn();
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

describe('useClientKPIs', () => {
  const mockClients: Client[] = [
    {
      id: 'client1',
      first_name: 'John',
      last_name: 'Doe',
      contact_number: '123-456-7890',
      email: 'john@example.com',
      tags: [],
      interest: '',
      note: '',
      client_number: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'client2',
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '098-765-4321',
      email: 'jane@example.com',
      tags: [],
      interest: '',
      note: '',
      client_number: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ];

  const mockSales: SalesHistory[] = [
    {
      id: 'sale1',
      client_id: 'client1',
      instrument_id: 'inst1',
      sale_date: '2024-01-10',
      sale_price: 1000,
      notes: 'Sale 1',
      created_at: '2024-01-10T00:00:00Z',
      client: undefined,
      instrument: undefined,
    },
    {
      id: 'sale2',
      client_id: 'client1',
      instrument_id: 'inst2',
      sale_date: '2024-01-15',
      sale_price: 2000,
      notes: 'Sale 2',
      created_at: '2024-01-15T00:00:00Z',
      client: undefined,
      instrument: undefined,
    },
    {
      id: 'sale3',
      client_id: 'client2',
      instrument_id: 'inst3',
      sale_date: '2024-01-20',
      sale_price: 1500,
      notes: 'Sale 3',
      created_at: '2024-01-20T00:00:00Z',
      client: undefined,
      instrument: undefined,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockHandleError.mockClear();
  });

  describe('useClientKPIs', () => {
    it('초기 상태: loading=true (데이터 페칭 중)', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      ); // 무한 대기

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      expect(result.current.loading).toBe(true);
    });

    it('enabled=false일 때 데이터를 가져오지 않음', async () => {
      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: false })
      );

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
      });
    });

    it('클라이언트가 없으면 데이터를 가져오지 않음', async () => {
      const { result } = renderHook(() => useClientKPIs([], { enabled: true }));

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
      });
    });

    it('KPI 계산 성공', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockSales,
        }),
      });

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalCustomers).toBe(2);
      expect(result.current.totalSpend).toBe(4500); // 1000 + 2000 + 1500
      expect(result.current.totalPurchases).toBe(3);
      expect(result.current.avgSpendPerCustomer).toBe(2250); // 4500 / 2
      expect(result.current.mostRecentPurchase).toBe('2024-01-20');
    });

    it('sale_price가 0인 판매는 제외', async () => {
      const salesWithZero: SalesHistory[] = [
        ...mockSales,
        {
          id: 'sale4',
          client_id: 'client1',
          instrument_id: 'inst4',
          sale_date: '2024-01-25',
          sale_price: 0, // 제외되어야 함
          notes: 'Refund',
          created_at: '2024-01-25T00:00:00Z',
          client: undefined,
          instrument: undefined,
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: salesWithZero,
        }),
      });

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalSpend).toBe(4500); // sale4는 제외
      expect(result.current.totalPurchases).toBe(3); // sale4는 제외
    });

    it('클라이언트가 판매가 없을 때', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
        }),
      });

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalCustomers).toBe(2);
      expect(result.current.totalSpend).toBe(0);
      expect(result.current.totalPurchases).toBe(0);
      expect(result.current.avgSpendPerCustomer).toBe(0);
      expect(result.current.mostRecentPurchase).toBe('—');
    });

    it('API 에러 처리', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Failed to fetch sales',
        }),
      });

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.totalSpend).toBe(0);
    });

    it('fetch 에러 처리', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalled();
    });

    it('중복 fetch 방지', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockSales,
        }),
      });

      const { rerender } = renderHook(
        ({ clients }) => useClientKPIs(clients, { enabled: true }),
        {
          initialProps: { clients: mockClients },
        }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      // 동일한 clients로 재렌더링
      rerender({ clients: mockClients });

      await waitFor(() => {
        // 재조회되지 않아야 함
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
    });

    it('여러 클라이언트의 판매 집계', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockSales,
        }),
      });

      const { result } = renderHook(() =>
        useClientKPIs(mockClients, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // client1: 1000 + 2000 = 3000
      // client2: 1500 = 1500
      // 총합: 4500
      expect(result.current.totalSpend).toBe(4500);
      expect(result.current.totalPurchases).toBe(3);
    });
  });

  describe('useClientSalesData', () => {
    it('clientId가 null이면 데이터를 가져오지 않음', async () => {
      const { result } = renderHook(() => useClientSalesData(null));

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
        expect(result.current.totalSpend).toBe(0);
        expect(result.current.purchaseCount).toBe(0);
        expect(result.current.lastPurchaseDate).toBe('—');
      });
    });

    it('클라이언트별 판매 데이터 가져오기', async () => {
      const clientSales = mockSales.filter(s => s.client_id === 'client1');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: clientSales,
        }),
      });

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalSpend).toBe(3000); // 1000 + 2000
      expect(result.current.purchaseCount).toBe(2);
      expect(result.current.lastPurchaseDate).toBe('2024-01-15');
    });

    it('sale_price가 0인 판매는 집계에서 제외', async () => {
      const salesWithZero: SalesHistory[] = [
        ...mockSales.filter(s => s.client_id === 'client1'),
        {
          id: 'sale4',
          client_id: 'client1',
          instrument_id: 'inst4',
          sale_date: '2024-01-25',
          sale_price: 0,
          notes: 'Refund',
          created_at: '2024-01-25T00:00:00Z',
          client: undefined,
          instrument: undefined,
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: salesWithZero,
        }),
      });

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalSpend).toBe(3000); // sale4 제외
      expect(result.current.purchaseCount).toBe(2); // sale4 제외
    });

    it('판매가 없을 때', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
        }),
      });

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalSpend).toBe(0);
      expect(result.current.purchaseCount).toBe(0);
      expect(result.current.lastPurchaseDate).toBe('—');
    });

    it('clientId 변경 시 재조회', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockSales.filter(s => s.client_id === 'client1'),
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockSales.filter(s => s.client_id === 'client2'),
          }),
        });

      const { result, rerender } = renderHook(
        ({ clientId }) => useClientSalesData(clientId),
        {
          initialProps: { clientId: 'client1' as string | null },
        }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.totalSpend).toBe(3000);
      });

      rerender({ clientId: 'client2' });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.totalSpend).toBe(1500);
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });

    it('API 에러 처리', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Failed to fetch sales',
        }),
      });

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.totalSpend).toBe(0);
      expect(result.current.purchaseCount).toBe(0);
      expect(result.current.lastPurchaseDate).toBe('—');
    });

    it('fetch 에러 처리', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.totalSpend).toBe(0);
      expect(result.current.purchaseCount).toBe(0);
      expect(result.current.lastPurchaseDate).toBe('—');
    });

    it('가장 최근 구매일 계산', async () => {
      const sales: SalesHistory[] = [
        {
          id: 'sale1',
          client_id: 'client1',
          instrument_id: 'inst1',
          sale_date: '2024-01-10',
          sale_price: 1000,
          notes: 'Sale 1',
          created_at: '2024-01-10T00:00:00Z',
          client: undefined,
          instrument: undefined,
        },
        {
          id: 'sale2',
          client_id: 'client1',
          instrument_id: 'inst2',
          sale_date: '2024-01-20',
          sale_price: 2000,
          notes: 'Sale 2',
          created_at: '2024-01-20T00:00:00Z',
          client: undefined,
          instrument: undefined,
        },
        {
          id: 'sale3',
          client_id: 'client1',
          instrument_id: 'inst3',
          sale_date: '2024-01-15',
          sale_price: 1500,
          notes: 'Sale 3',
          created_at: '2024-01-15T00:00:00Z',
          client: undefined,
          instrument: undefined,
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: sales,
        }),
      });

      const { result } = renderHook(() => useClientSalesData('client1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastPurchaseDate).toBe('2024-01-20'); // 가장 최근
    });
  });
});
