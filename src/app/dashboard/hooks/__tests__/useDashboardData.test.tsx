import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { Instrument, ClientInstrument } from '@/types';

const mockCreateInstrument = jest.fn();
const mockUpdateInstrument = jest.fn();
const mockDeleteInstrument = jest.fn();
const mockWithSubmitting = jest.fn(async (cb: () => Promise<unknown>) => cb());
const mockShowSuccess = jest.fn();
const mockHandleError = jest.fn();

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedDashboard: jest.fn(() => ({
    instruments: [],
    clients: [],
    loading: {
      any: false,
      hasAnyLoading: false,
      instruments: false,
      clients: false,
      connections: false,
    },
    errors: { instruments: null, clients: null, connections: null },
    submitting: { any: false, hasAnySubmitting: false },
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

  function setDashboardState(overrides: Record<string, unknown> = {}) {
    const { useUnifiedDashboard } = require('@/hooks/useUnifiedData');
    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: [mockInstrument],
      clients: [],
      loading: {
        any: false,
        hasAnyLoading: false,
        instruments: false,
        clients: false,
        connections: false,
      },
      errors: { instruments: null, clients: null, connections: null },
      submitting: { any: false, hasAnySubmitting: false },
      clientRelationships: [],
      createInstrument: mockCreateInstrument,
      updateInstrument: mockUpdateInstrument,
      deleteInstrument: mockDeleteInstrument,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setDashboardState();
  });

  it('returns dashboard data and handlers', () => {
    const { result } = renderHook(() => useDashboardData());

    expect(result.current.instruments).toHaveLength(1);
    expect(typeof result.current.handleCreateItem).toBe('function');
    expect(typeof result.current.handleUpdateItem).toBe('function');
    expect(typeof result.current.handleUpdateItemInline).toBe('function');
    expect(typeof result.current.handleDeleteItem).toBe('function');
  });

  it('normalizes missing error fields instead of crashing on incomplete hook data', () => {
    setDashboardState({
      errors: undefined,
    });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.hasFatalError).toBe(false);
    expect(result.current.errors).toEqual({
      clients: null,
      instruments: null,
      connections: null,
      any: false,
      hasAnyError: false,
    });
  });

  it('creates an item successfully', async () => {
    mockCreateInstrument.mockResolvedValue(mockInstrument);
    const { result } = renderHook(() => useDashboardData());

    let createdId: string | null = null;
    await act(async () => {
      createdId = await result.current.handleCreateItem({
        maker: 'Maker',
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
        status: 'Available',
      });
    });

    expect(mockCreateInstrument).toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(createdId).toBe(mockInstrument.id);
  });

  it('does not report success when create returns null (API failure)', async () => {
    mockCreateInstrument.mockResolvedValue(null);
    const { result } = renderHook(() => useDashboardData());

    let createdId: string | null = 'should-be-cleared';
    await act(async () => {
      createdId = await result.current.handleCreateItem({
        maker: 'Maker',
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
        status: 'Available',
      });
    });

    expect(createdId).toBeNull();
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('updates a non-status change through updateInstrument directly (no success toast; page owns modal flow)', async () => {
    const updatedInstrument = { ...mockInstrument, maker: 'Updated Maker' };
    mockUpdateInstrument.mockResolvedValue(updatedInstrument);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        maker: 'Updated Maker',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(mockInstrument.id, {
      maker: 'Updated Maker',
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('uses atomic sale transition payload when moving to Sold', async () => {
    const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
    mockUpdateInstrument.mockResolvedValue(soldInstrument);
    setDashboardState({
      instruments: [mockInstrument],
      clientRelationships: [mockSoldConnection],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Sold',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        status: 'Sold',
        sale_transition: expect.objectContaining({
          sale_price: 1500000,
          client_id: 'client-1',
          sales_note: 'Auto-created when instrument status changed to Sold',
        }),
      })
    );
  });

  it('prefers formData.price for Sold transition payload', async () => {
    const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
    mockUpdateInstrument.mockResolvedValue(soldInstrument);
    setDashboardState({
      instruments: [mockInstrument],
      clientRelationships: [mockSoldConnection],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Sold',
        price: 2000000,
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        price: 2000000,
        sale_transition: expect.objectContaining({
          sale_price: 2000000,
        }),
      })
    );
  });

  it('rejects Sold transition when there is no valid positive sale price', async () => {
    setDashboardState({
      instruments: [{ ...mockInstrument, price: null }],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
        })
      ).rejects.toThrow(
        'Sale price is required when marking an instrument as Sold.'
      );
    });

    expect(mockUpdateInstrument).not.toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
  });

  it('uses atomic refund transition payload when moving away from Sold', async () => {
    const soldInstrument = { ...mockInstrument, status: 'Sold' as const };
    const updatedInstrument = {
      ...soldInstrument,
      status: 'Available' as const,
    };
    mockUpdateInstrument.mockResolvedValue(updatedInstrument);
    setDashboardState({
      instruments: [soldInstrument],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Available',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        status: 'Available',
        sale_transition: expect.objectContaining({
          sales_note: expect.stringContaining(
            'Auto-refunded when instrument status changed from Sold to Available'
          ),
        }),
      })
    );
  });

  it('propagates update failures', async () => {
    const error = new Error('Update failed');
    mockUpdateInstrument.mockRejectedValue(error);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          maker: 'Updated',
        })
      ).rejects.toThrow('Update failed');
    });

    expect(mockHandleError).toHaveBeenCalledWith(
      error,
      'Failed to update item'
    );
  });

  it('handleUpdateItemInline delegates to handleUpdateItem and shows inline success toast', async () => {
    mockUpdateInstrument.mockResolvedValue(mockInstrument);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItemInline(mockInstrument.id, {
        maker: 'Updated',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith(
      '아이템이 성공적으로 수정되었습니다.'
    );
  });

  it('deletes an item successfully', async () => {
    mockDeleteInstrument.mockResolvedValue(true);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleDeleteItem(mockInstrument.id);
    });

    expect(mockDeleteInstrument).toHaveBeenCalledWith(mockInstrument.id);
    expect(mockShowSuccess).toHaveBeenCalledWith(
      '아이템이 성공적으로 삭제되었습니다.'
    );
  });
});
