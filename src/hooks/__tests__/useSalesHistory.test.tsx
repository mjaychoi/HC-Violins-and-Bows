import { renderHook, waitFor, act } from '@testing-library/react';
import { useSalesHistory } from '../../app/sales/hooks/useSalesHistory';
import { useErrorHandler } from '../useErrorHandler';
import { SalesHistory } from '@/types';

jest.mock('../useErrorHandler');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

const mockUseErrorHandler = useErrorHandler as jest.MockedFunction<
  typeof useErrorHandler
>;
const mockHandleError = jest.fn();

describe('useSalesHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockUseErrorHandler.mockReturnValue({
      handleError: mockHandleError,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchSales', () => {
    it('should fetch sales with pagination', async () => {
      const mockSales: SalesHistory[] = [
        {
          id: 'sale-1',
          instrument_id: 'inst-1',
          client_id: 'client-1',
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          notes: 'Test sale',
          created_at: '2024-01-15T10:30:00Z',
        },
      ];

      const mockResponse = {
        data: mockSales,
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSalesHistory());

      await act(async () => {
        await result.current.fetchSales({ page: 1 });
      });

      expect(result.current.sales).toEqual(mockSales);
      expect(result.current.page).toBe(1);
      expect(result.current.totalCount).toBe(1);
      expect(result.current.totalPages).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sales?page=1')
      );
    });

    it('should handle filters', async () => {
      const mockResponse = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 1,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSalesHistory());

      await act(async () => {
        await result.current.fetchSales({
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
          search: 'violin',
          page: 1,
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('fromDate=2024-01-01')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('toDate=2024-12-31')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=violin')
      );
    });

    it('should handle errors', async () => {
      const mockError = { message: 'Failed to fetch' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: mockError }),
      });

      const { result } = renderHook(() => useSalesHistory());

      await act(async () => {
        await result.current.fetchSales({ page: 1 });
      });

      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.error).toBeDefined();
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useSalesHistory());

      await act(async () => {
        await result.current.fetchSales({ page: 1 });
      });

      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('createSale', () => {
    it('should create a new sale', async () => {
      const mockSale: SalesHistory = {
        id: 'sale-1',
        instrument_id: 'inst-1',
        client_id: 'client-1',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Test sale',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockCreateResponse = {
        data: mockSale,
      };

      // Unused variable removed to fix ESLint warning

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCreateResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockSale],
            pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
          }),
        });

      const { result } = renderHook(() => useSalesHistory());

      const payload = {
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        client_id: 'client-1',
        instrument_id: 'inst-1',
        notes: 'Test sale',
      };

      const created = await act(async () => {
        return await result.current.createSale(payload);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(created).toEqual(mockSale);
      expect(global.fetch).toHaveBeenCalledWith('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    });

    it('should handle creation errors', async () => {
      const mockError = { message: 'Failed to create' };

      // Unused variable removed to fix ESLint warning

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: mockError }),
      });

      const { result } = renderHook(() => useSalesHistory());

      const payload = {
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        client_id: null,
        instrument_id: null,
        notes: null,
      };

      const created = await act(async () => {
        return await result.current.createSale(payload);
      });

      expect(created).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('refundSale', () => {
    it('should refund a sale', async () => {
      const originalSale: SalesHistory = {
        id: 'sale-1',
        instrument_id: 'inst-1',
        client_id: 'client-1',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Original notes',
        created_at: '2024-01-15T10:30:00Z',
      };

      const refundedSale: SalesHistory = {
        ...originalSale,
        sale_price: -2500.0,
        notes: 'Refund issued | Original notes',
      };

      const mockRefundResponse = {
        data: refundedSale,
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRefundResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [refundedSale],
            pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
          }),
        });

      const { result } = renderHook(() => useSalesHistory());

      // page state를 1로 설정 (refundSale이 현재 page를 사용)
      await act(async () => {
        result.current.setPage(1);
      });

      const refunded = await act(async () => {
        return await result.current.refundSale(originalSale, 'Refund issued');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(refunded).toEqual(refundedSale);
      expect(global.fetch).toHaveBeenCalledWith('/api/sales', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'sale-1',
          sale_price: -2500.0,
          notes: 'Refund issued | Original notes',
        }),
      });
    });

    it('should handle refund errors', async () => {
      const sale: SalesHistory = {
        id: 'sale-1',
        instrument_id: null,
        client_id: null,
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: null,
        created_at: '2024-01-15T10:30:00Z',
      };

      // Unused variable removed to fix ESLint warning

      const mockError = { message: 'Failed to refund' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: mockError }),
      });

      const { result } = renderHook(() => useSalesHistory());

      const refunded = await act(async () => {
        return await result.current.refundSale(sale);
      });

      expect(refunded).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('should handle already refunded sale', async () => {
      const refundedSale: SalesHistory = {
        id: 'sale-1',
        instrument_id: null,
        client_id: null,
        sale_price: -2500.0,
        sale_date: '2024-01-15',
        notes: 'Already refunded',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockRefundResponse = {
        data: refundedSale,
      };

      const mockFetchResponse = {
        data: [refundedSale],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
        },
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRefundResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFetchResponse,
        });

      const { result } = renderHook(() => useSalesHistory());

      await act(async () => {
        result.current.setPage(1);
      });

      // Already refunded sale (negative price) still calls API but price remains negative
      const refunded = await act(async () => {
        return await result.current.refundSale(refundedSale);
      });

      expect(refunded).toEqual(refundedSale);
      expect(global.fetch).toHaveBeenCalledWith('/api/sales', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'sale-1',
          sale_price: -2500.0, // Should remain negative
          notes: 'Already refunded',
        }),
      });
      expect(global.fetch).toHaveBeenCalledWith('/api/sales', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'sale-1',
          sale_price: -2500.0, // Should remain negative
          notes: 'Already refunded',
        }),
      });
    });
  });

  describe('setPage', () => {
    it('should update page number', async () => {
      const mockResponse = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 1,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSalesHistory());

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.setPage(2);
      });

      expect(result.current.page).toBe(2);
    });
  });

  describe('initialization', () => {
    it('should fetch sales on mount', async () => {
      const mockResponse = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 1,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSalesHistory());

      // 초기 fetch는 더 이상 자동으로 실행되지 않음
      // SalesPage에서 필터 상태와 함께 관리됨
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.sales).toEqual([]);

      // 수동으로 fetch를 호출해야 함
      await act(async () => {
        await result.current.fetchSales({ page: 1 });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sales?page=1')
      );
    });
  });
});
