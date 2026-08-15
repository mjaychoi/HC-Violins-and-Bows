import { renderHook, act } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { Instrument, ClientInstrument } from '@/types';

const mockCreateInstrument = jest.fn();
const mockUpdateInstrument = jest.fn();
const mockDeleteInstrument = jest.fn();
const mockFetchConnections = jest.fn().mockResolvedValue(undefined);
const mockInvalidateCache = jest.fn();
const mockWithSubmitting = jest.fn(async (cb: () => Promise<unknown>) => cb());
const mockShowSuccess = jest.fn();

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
    fetchConnections: mockFetchConnections,
    invalidateCache: mockInvalidateCache,
  })),
}));

jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: jest.fn(() => ({
    withSubmitting: mockWithSubmitting,
  })),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: jest.fn(() => ({
    handleError: jest.fn(),
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
    updated_at: '2024-01-02T00:00:00Z',
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
      fetchConnections: mockFetchConnections,
      invalidateCache: mockInvalidateCache,
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

    let created: Instrument | null = null;
    await act(async () => {
      created = await result.current.handleCreateItem({
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

    expect(mockCreateInstrument).toHaveBeenCalledWith(
      expect.objectContaining({ maker: 'Maker', type: 'Violin' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect((created as Instrument | null)?.id ?? null).toBe(mockInstrument.id);
  });

  it('propagates error when createInstrument rejects', async () => {
    const apiError = new Error('Failed to create instrument');
    mockCreateInstrument.mockRejectedValue(apiError);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleCreateItem({
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
        })
      ).rejects.toThrow('Failed to create instrument');
    });

    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('throws when createInstrument resolves without an id', async () => {
    mockCreateInstrument.mockResolvedValue({
      ...mockInstrument,
      id: '',
    } as Instrument);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleCreateItem({
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
        })
      ).rejects.toThrow('Instrument creation failed');
    });
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
      updated_at: mockInstrument.updated_at,
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('TEST-6/9: keeps an explicit dirty draft T0 token when the collection is already T1', async () => {
    const t0 = '2024-01-02T00:00:00Z';
    const t1 = '2024-01-02T00:00:01Z';
    setDashboardState({
      instruments: [
        {
          ...mockInstrument,
          ownership: 'Shelf B',
          note: 'Old',
          updated_at: t1,
        },
      ],
    });
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      ownership: 'Shelf B',
      note: 'A note',
      updated_at: t1,
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        ownership: 'Shelf A',
        note: 'A note',
        cost_price: 400,
        updated_at: t0,
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(mockInstrument.id, {
      ownership: 'Shelf A',
      note: 'A note',
      cost_price: 400,
      updated_at: t0,
    });
    expect(mockUpdateInstrument.mock.calls[0][1].updated_at).not.toBe(t1);
  });

  it('TEST-18: does not treat a network failure as a token upgrade', async () => {
    mockUpdateInstrument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          note: 'A note',
          updated_at: mockInstrument.updated_at,
        })
      ).rejects.toThrow('Network error');
    });

    expect(mockUpdateInstrument).toHaveBeenCalledTimes(1);
    expect(mockUpdateInstrument).toHaveBeenCalledWith(mockInstrument.id, {
      note: 'A note',
      updated_at: mockInstrument.updated_at,
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
        updated_at: mockInstrument.updated_at,
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
        updated_at: mockInstrument.updated_at,
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
  });

  it('rejects zero sale price client-side before sending Sold transition', async () => {
    setDashboardState({
      instruments: [{ ...mockInstrument, price: 0 }],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: 0,
        })
      ).rejects.toThrow('Sale price must be greater than zero.');
    });

    expect(mockUpdateInstrument).not.toHaveBeenCalled();
  });

  it('rejects negative and non-finite sale prices client-side', async () => {
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: -100,
        })
      ).rejects.toThrow('Sale price must be greater than zero.');
    });

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: Number.NaN,
        })
      ).rejects.toThrow(
        'Sale price is required when marking an instrument as Sold.'
      );
    });

    expect(mockUpdateInstrument).not.toHaveBeenCalled();
  });

  it('accepts a positive valid sale price for Sold transition', async () => {
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      status: 'Sold' as const,
      price: 2500,
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Sold',
        price: 2500,
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        sale_transition: expect.objectContaining({
          sale_price: 2500,
        }),
      })
    );
  });

  it('rejects a sale price with more than two decimal places instead of rounding it', async () => {
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: 2500.999,
        })
      ).rejects.toThrow('Sale price cannot have more than two decimal places.');
    });

    expect(mockUpdateInstrument).not.toHaveBeenCalled();
  });

  it('rejects a sale price above the shared maximum', async () => {
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: 1_000_000_000.01,
        })
      ).rejects.toThrow(/cannot exceed/);
    });

    expect(mockUpdateInstrument).not.toHaveBeenCalled();
  });

  it('includes sale_transition when instrument is absent from instrumentMap', async () => {
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      status: 'Sold' as const,
    });
    // Simulate truncated / incomplete cache: target instrument not in list
    setDashboardState({
      instruments: [],
      truncated: true,
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Sold',
        price: 1500000,
        updated_at: mockInstrument.updated_at,
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        status: 'Sold',
        sale_transition: expect.objectContaining({
          sale_price: 1500000,
          sales_note: 'Auto-created when instrument status changed to Sold',
        }),
      })
    );
  });

  it('includes sale_transition under a simulated truncated all-instruments dataset', async () => {
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      id: 'inst-truncated',
      status: 'Sold' as const,
    });
    // Only the first page of instruments is cached; the edited id is truncated out
    setDashboardState({
      instruments: Array.from({ length: 3 }, (_, i) => ({
        ...mockInstrument,
        id: `other-${i}`,
      })),
      truncated: true,
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem('inst-truncated', {
        status: 'Sold',
        price: 999,
        updated_at: '2024-01-02T00:00:00Z',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      'inst-truncated',
      expect.objectContaining({
        status: 'Sold',
        sale_transition: expect.objectContaining({
          sale_price: 999,
        }),
      })
    );
  });

  it('includes sale_transition immediately after create before a full refetch', async () => {
    const createdId = 'inst-just-created';
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      id: createdId,
      status: 'Sold' as const,
    });
    // Create succeeded but instruments list has not yet been refetched
    setDashboardState({
      instruments: [],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(createdId, {
        status: 'Sold',
        price: 4200,
        updated_at: mockInstrument.updated_at,
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      createdId,
      expect.objectContaining({
        status: 'Sold',
        sale_transition: expect.objectContaining({
          sale_price: 4200,
        }),
      })
    );
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
        updated_at: mockInstrument.updated_at,
        sale_transition: expect.objectContaining({
          sales_note: expect.stringContaining(
            'Auto-refunded when instrument status changed from Sold to Available'
          ),
        }),
      })
    );
  });

  it('sends refund transition for Sold → Available even when instrumentMap lookup misses', async () => {
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      status: 'Available' as const,
    });
    setDashboardState({
      instruments: [],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        status: 'Available',
        updated_at: mockInstrument.updated_at,
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

  it('does not send sale_transition for ordinary same-session updates without status', async () => {
    mockUpdateInstrument.mockResolvedValue({
      ...mockInstrument,
      maker: 'Updated Maker',
    });
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(mockInstrument.id, {
        maker: 'Updated Maker',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      mockInstrument.id,
      expect.objectContaining({
        maker: 'Updated Maker',
      })
    );
    expect(mockUpdateInstrument.mock.calls[0][1]).not.toHaveProperty(
      'sale_transition'
    );
  });

  it('does not send sale_transition for same-status Sold metadata edits', async () => {
    const soldInstrument = {
      ...mockInstrument,
      status: 'Sold' as const,
      note: 'old',
    };
    mockUpdateInstrument.mockResolvedValue({
      ...soldInstrument,
      note: 'cleaned',
    });
    setDashboardState({
      instruments: [soldInstrument],
    });

    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleUpdateItem(soldInstrument.id, {
        status: 'Sold',
        note: 'cleaned',
      });
    });

    expect(mockUpdateInstrument).toHaveBeenCalledWith(
      soldInstrument.id,
      expect.objectContaining({
        status: 'Sold',
        note: 'cleaned',
      })
    );
    expect(mockUpdateInstrument.mock.calls[0][1]).not.toHaveProperty(
      'sale_transition'
    );
  });

  it('surfaces server sale errors without pretending the sale succeeded', async () => {
    const serverError = new Error(
      'This record was updated elsewhere. Refresh and try again.'
    );
    mockUpdateInstrument.mockRejectedValue(serverError);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItem(mockInstrument.id, {
          status: 'Sold',
          price: 1500000,
        })
      ).rejects.toThrow(
        'This record was updated elsewhere. Refresh and try again.'
      );
    });

    expect(mockShowSuccess).not.toHaveBeenCalled();
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

    expect(mockShowSuccess).not.toHaveBeenCalled();
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
    expect(mockShowSuccess).toHaveBeenCalledWith('Item updated successfully.');
  });

  it('handleUpdateItemInline does not show success when update rejects', async () => {
    mockUpdateInstrument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleUpdateItemInline(mockInstrument.id, {
          maker: 'Updated',
        })
      ).rejects.toThrow('Network error');
    });

    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('deletes an item successfully', async () => {
    mockDeleteInstrument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await result.current.handleDeleteItem(mockInstrument.id);
    });

    expect(mockDeleteInstrument).toHaveBeenCalledWith(mockInstrument.id);
    expect(mockShowSuccess).toHaveBeenCalledWith('Item deleted successfully.');
  });

  it('handleDeleteItem propagates delete failures', async () => {
    const err = new Error('Delete failed');
    mockDeleteInstrument.mockRejectedValue(err);
    const { result } = renderHook(() => useDashboardData());

    await act(async () => {
      await expect(
        result.current.handleDeleteItem(mockInstrument.id)
      ).rejects.toThrow('Delete failed');
    });

    expect(mockShowSuccess).not.toHaveBeenCalled();
  });
});
