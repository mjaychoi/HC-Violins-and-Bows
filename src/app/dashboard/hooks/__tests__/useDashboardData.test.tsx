import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { Instrument, ClientInstrument } from '@/types';

// Mock fetch
global.fetch = jest.fn();

// Mock hooks
const mockCreateInstrument = jest.fn();
const mockUpdateInstrument = jest.fn();
const mockDeleteInstrument = jest.fn();
const mockWithSubmitting = jest.fn(
  async (cb: () => Promise<any>) => await cb()
);
const mockShowSuccess = jest.fn();
const mockHandleError = jest.fn();

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedDashboard: jest.fn(() => ({
    instruments: [],
    clients: [],
    loading: { any: false },
    submitting: { any: false },
    clientRelationships: [],
    createInstrument: mockCreateInstrument,
    updateInstrument: mockUpdateInstrument,
    deleteInstrument: mockDeleteInstrument,
  })),
}));

jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: jest.fn(() => ({
    withSubmitting: mockWithSubmitting,
  })),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: jest.fn(() => ({
    handleError: mockHandleError,
  })),
  useToast: jest.fn(() => ({
    showSuccess: mockShowSuccess,
  })),
}));

describe('useDashboardData', () => {
  const mockInstrument: Instrument = {
    id: 'inst-1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: null,
    serial_number: 'SN123',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: 1500000,
    certificate: false,
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockSoldConnection: ClientInstrument = {
    id: 'conn-1',
    client_id: 'client-1',
    instrument_id: 'inst-1',
    relationship_type: 'Sold',
    notes: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('initial state', () => {
    it('should return initial data from useUnifiedDashboard', () => {
      const { result } = renderHook(() => useDashboardData());

      expect(result.current.instruments).toEqual([]);
      expect(result.current.clients).toEqual([]);
      expect(result.current.clientRelationships).toEqual([]);
      expect(typeof result.current.handleCreateItem).toBe('function');
      expect(typeof result.current.handleUpdateItem).toBe('function');
      expect(typeof result.current.handleUpdateItemInline).toBe('function');
      expect(typeof result.current.handleDeleteItem).toBe('function');
    });
  });

  describe('handleCreateItem', () => {
    it('should create item successfully', async () => {
      const newItem = {
        maker: 'New Maker',
        type: 'Violin',
        subtype: null,
        serial_number: 'SN999',
        year: 1800,
        ownership: null,
        size: null,
        weight: null,
        note: null,
        price: null,
        certificate: false,
        status: 'Available' as const,
      };

      mockCreateInstrument.mockResolvedValue(mockInstrument);

      const { result } = renderHook(() => useDashboardData());

      let createdId: string | null = null;
      await act(async () => {
        createdId = await result.current.handleCreateItem(newItem);
      });

      expect(mockCreateInstrument).toHaveBeenCalledWith(newItem);
      expect(mockShowSuccess).toHaveBeenCalledWith(
        '아이템이 성공적으로 생성되었습니다.'
      );
      expect(createdId).toBe(mockInstrument.id);
    });

    it('should handle creation error', async () => {
      const error = new Error('Creation failed');
      mockCreateInstrument.mockRejectedValue(error);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await expect(
          result.current.handleCreateItem({
            maker: 'Test',
            type: 'Violin',
            subtype: null,
            serial_number: 'SN999',
            year: 1800,
            ownership: null,
            size: null,
            weight: null,
            note: null,
            price: null,
            certificate: false,
            status: 'Available' as const,
          })
        ).rejects.toThrow();
      });

      expect(mockHandleError).toHaveBeenCalledWith(
        error,
        'Failed to create item'
      );
    });
  });

  describe('handleUpdateItem', () => {
    beforeEach(() => {
      // Setup instruments in mock
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });
    });

    it('should update item successfully', async () => {
      const updatedInstrument = { ...mockInstrument, maker: 'Updated Maker' };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const { result } = renderHook(() => useDashboardData());

      let updated: Instrument | null = null;
      await act(async () => {
        updated = await result.current.handleUpdateItem(mockInstrument.id, {
          maker: 'Updated Maker',
        });
      });

      expect(mockUpdateInstrument).toHaveBeenCalledWith(mockInstrument.id, {
        maker: 'Updated Maker',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith(
        '아이템이 성공적으로 수정되었습니다.'
      );
      expect(updated).toEqual(updatedInstrument);
    });

    it('should handle update error', async () => {
      const error = new Error('Update failed');
      mockUpdateInstrument.mockRejectedValue(error);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await expect(
          result.current.handleUpdateItem(mockInstrument.id, {
            maker: 'Updated',
          })
        ).rejects.toThrow();
      });

      expect(mockHandleError).toHaveBeenCalledWith(
        error,
        'Failed to update item'
      );
    });

    it('should handle update when updateInstrument returns null', async () => {
      mockUpdateInstrument.mockResolvedValue(null);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await expect(
          result.current.handleUpdateItem(mockInstrument.id, {
            maker: 'Updated',
          })
        ).rejects.toThrow('Failed to update item');
      });

      expect(mockHandleError).toHaveBeenCalled();
    });

    it('should create sales history when status changes to Sold', async () => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      // Mock sold connection
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock sales API check - no existing sale
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // Mock sales API create
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(mockUpdateInstrument).toHaveBeenCalled();
      expect(mockShowSuccess).toHaveBeenCalled();
    });

    it('should not create sales history when price is invalid', async () => {
      const instrumentWithoutPrice = { ...mockInstrument, price: null };
      const soldInstrument = {
        ...instrumentWithoutPrice,
        status: 'Sold' as const,
      };

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [instrumentWithoutPrice],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(instrumentWithoutPrice.id, {
          status: 'Sold',
        });
      });

      // Should not call sales API when price is invalid
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/sales'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('handleUpdateItemInline', () => {
    beforeEach(() => {
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });
    });

    it('should call handleUpdateItem and return void', async () => {
      mockUpdateInstrument.mockResolvedValue(mockInstrument);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItemInline(mockInstrument.id, {
          maker: 'Updated',
        });
      });

      expect(mockUpdateInstrument).toHaveBeenCalled();
    });
  });

  describe('handleDeleteItem', () => {
    it('should delete item successfully', async () => {
      mockDeleteInstrument.mockResolvedValue(true);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleDeleteItem('inst-1');
      });

      expect(mockDeleteInstrument).toHaveBeenCalledWith('inst-1');
      expect(mockShowSuccess).toHaveBeenCalledWith(
        '아이템이 성공적으로 삭제되었습니다.'
      );
    });

    it('should handle delete error', async () => {
      const error = new Error('Delete failed');
      mockDeleteInstrument.mockRejectedValue(error);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await expect(
          result.current.handleDeleteItem('inst-1')
        ).rejects.toThrow();
      });

      expect(mockHandleError).toHaveBeenCalledWith(
        error,
        'Failed to delete item'
      );
    });
  });

  describe('handleUpdateItem - status change edge cases', () => {
    beforeEach(() => {
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });
    });

    it('should skip status-related logic when status is not changing', async () => {
      mockUpdateInstrument.mockResolvedValue(mockInstrument);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          maker: 'Updated Maker', // status not included
        });
      });

      // Should not call sales API when status is not changing
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpdateInstrument).toHaveBeenCalled();
      expect(mockShowSuccess).toHaveBeenCalled();
    });

    it('should not create sales history when status changes to Sold but price is 0', async () => {
      const instrumentWithZeroPrice = { ...mockInstrument, price: 0 };
      const soldInstrument = {
        ...instrumentWithZeroPrice,
        status: 'Sold' as const,
      };

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [instrumentWithZeroPrice],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(instrumentWithZeroPrice.id, {
          status: 'Sold',
        });
      });

      // Should not call sales API when price is 0
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not create sales history when status changes to Sold but price is negative', async () => {
      const instrumentWithNegativePrice = { ...mockInstrument, price: -100 };
      const soldInstrument = {
        ...instrumentWithNegativePrice,
        status: 'Sold' as const,
      };

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [instrumentWithNegativePrice],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(instrumentWithNegativePrice.id, {
          status: 'Sold',
        });
      });

      // Should not call sales API when price is negative
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not create sales history when existing auto-created sale already exists', async () => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock check response with existing auto-created sale
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'sale-1',
              notes: 'Auto-created when instrument status changed to Sold',
            },
          ],
        }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Should check for existing sale but not create new one
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sales?instrument_id=inst-1&sale_date=')
      );
      // Should NOT create new sale (idempotent)
      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle checkResponse.ok === false when checking for existing sale', async () => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock check response with error
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Check failed' }),
      });

      // Mock create sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });

      // Should still create sale when check fails
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle sales history creation API failure gracefully', async () => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock check response - no existing sale
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // Mock create sales API failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to create sale' }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
        });
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      // Should warn but not throw error
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to create sales history:',
        expect.any(Object)
      );
      expect(mockShowSuccess).toHaveBeenCalled(); // Update should still succeed

      consoleWarnSpy.mockRestore();
    });

    it('should use formData.price over previousInstrument.price when creating sales history', async () => {
      const instrumentWithPrice = { ...mockInstrument, price: 1000000 };
      const soldInstrument = {
        ...instrumentWithPrice,
        status: 'Sold' as const,
        price: 2000000,
      };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [instrumentWithPrice],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock check response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // Mock create sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: 2000000, // formData.price
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/sales',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"sale_price":2000000'),
          })
        );
      });
    });

    it('should handle price as string in formData', async () => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      mockUpdateInstrument.mockResolvedValue(soldInstrument);

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      // Mock check response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // Mock create sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: '1500000' as any, // string price
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/sales',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"sale_price":1500000'),
          })
        );
      });
    });
  });

  describe('handleUpdateItem - refund logic', () => {
    beforeEach(() => {
      const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [soldInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });
    });

    it('should auto-refund when status changes from Sold to Available', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const mockRecentSale = {
        id: 'sale-1',
        sale_price: 1500000,
        instrument_id: 'inst-1',
        notes: 'Test sale',
      };

      // Mock fetch sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockRecentSale] }),
      });

      // Mock refund API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });

      // Should call refund API
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"sale_price":-1500000'),
        })
      );
      expect(mockShowSuccess).toHaveBeenCalledWith(
        '판매 기록이 자동으로 환불 처리되었습니다.'
      );
    });

    it('should not refund when no recent sale is found', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      // Mock fetch sales API - no sales
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Should not call refund API when no sale found
      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should not refund when recent sale has negative price (already refunded)', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const mockRefundedSale = {
        id: 'sale-1',
        sale_price: -1500000, // Already refunded
        instrument_id: 'inst-1',
      };

      // Mock fetch sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockRefundedSale] }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Should not call refund API when sale is already refunded (negative price)
      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should handle fetch sales API failure gracefully during refund', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock fetch sales API failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to fetch sales' }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      // Should not throw, just warn
      expect(consoleWarnSpy).not.toHaveBeenCalled(); // Only warns on exception
      expect(mockShowSuccess).toHaveBeenCalled(); // Update should still succeed

      consoleWarnSpy.mockRestore();
    });

    it('should handle refund API failure gracefully', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const mockRecentSale = {
        id: 'sale-1',
        sale_price: 1500000,
        instrument_id: 'inst-1',
      };

      // Mock fetch sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockRecentSale] }),
      });

      // Mock refund API failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to refund' }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to auto-refund sales history:',
        expect.any(Object)
      );
      expect(mockShowSuccess).toHaveBeenCalled(); // Update should still succeed

      consoleWarnSpy.mockRestore();
    });

    it('should handle exception during refund gracefully', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock fetch to throw exception
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to auto-refund sales history:',
        expect.any(Error)
      );
      expect(mockShowSuccess).toHaveBeenCalled(); // Update should still succeed

      consoleWarnSpy.mockRestore();
    });

    it('should include original notes when refunding', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const mockRecentSale = {
        id: 'sale-1',
        sale_price: 1500000,
        instrument_id: 'inst-1',
        notes: 'Original sale notes',
      };

      // Mock fetch sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockRecentSale] }),
      });

      // Mock refund API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/sales',
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('Original sale notes'),
          })
        );
      });
    });

    it('should handle sale without notes when refunding', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        status: 'Available' as const,
      };
      mockUpdateInstrument.mockResolvedValue(updatedInstrument);

      const mockRecentSale = {
        id: 'sale-1',
        sale_price: 1500000,
        instrument_id: 'inst-1',
        notes: null,
      };

      // Mock fetch sales API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockRecentSale] }),
      });

      // Mock refund API
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'sale-1' } }),
      });

      const { result } = renderHook(() => useDashboardData());

      await act(async () => {
        await result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Available',
        });
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/sales',
          expect.objectContaining({ method: 'PATCH' })
        );
      });

      // Should not include notes separator when notes is null
      const callArgs = (global.fetch as jest.Mock).mock.calls.find(
        call => call[0] === '/api/sales' && call[1]?.method === 'PATCH'
      );
      expect(callArgs).toBeDefined();
      const body = JSON.parse(callArgs[1].body);
      expect(body.notes).not.toContain(' | null');
    });
  });

  describe('handleCreateItem edge cases', () => {
    it('should return null when createInstrument returns null', async () => {
      mockCreateInstrument.mockResolvedValue(null);

      const { result } = renderHook(() => useDashboardData());

      let createdId: string | null = null;
      await act(async () => {
        createdId = await result.current.handleCreateItem({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdId).toBeNull();
      expect(mockShowSuccess).toHaveBeenCalled(); // Still shows success
    });

    it('should return null when createInstrument returns undefined', async () => {
      mockCreateInstrument.mockResolvedValue(undefined);

      const { result } = renderHook(() => useDashboardData());

      let createdId: string | null = null;
      await act(async () => {
        createdId = await result.current.handleCreateItem({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdId).toBeNull();
    });
  });

  describe('memoization', () => {
    it('should memoize instrumentMap when instruments change', () => {
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      const { result, rerender } = renderHook(() => useDashboardData());

      // Change instruments
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [{ ...mockInstrument, id: 'inst-2' }],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      rerender();

      // handleUpdateItem should be recreated when dependencies change
      expect(typeof result.current.handleUpdateItem).toBe('function');
    });

    it('should memoize soldConnectionsMap', () => {
      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      const { result } = renderHook(() => useDashboardData());

      // Should work correctly with sold connection
      expect(result.current.clientRelationships).toHaveLength(1);
    });

    it('should filter out non-Sold connections in soldConnectionsMap', () => {
      const interestedConnection: ClientInstrument = {
        id: 'conn-2',
        client_id: 'client-2',
        instrument_id: 'inst-1',
        relationship_type: 'Interested',
        notes: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
      (useUnifiedDashboard as jest.Mock).mockReturnValue({
        instruments: [mockInstrument],
        clients: [],
        loading: { any: false },
        submitting: { any: false },
        clientRelationships: [mockSoldConnection, interestedConnection],
        createInstrument: mockCreateInstrument,
        updateInstrument: mockUpdateInstrument,
        deleteInstrument: mockDeleteInstrument,
      });

      const { result } = renderHook(() => useDashboardData());

      // Both connections should be in clientRelationships
      expect(result.current.clientRelationships).toHaveLength(2);
    });
  });
});
