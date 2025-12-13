import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardItems } from '../useDashboardItems';
import { Instrument, InstrumentImage, ClientInstrument } from '@/types';

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
  logApiRequest: jest.fn(),
}));

const mockInstrument: Instrument = {
  id: 'inst1',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1700,
  certificate: true,
  size: null,
  weight: null,
  price: 100000,
  ownership: null,
  note: null,
  serial_number: 'VI0000001',
  status: 'Available',
  created_at: '2024-01-01',
};

describe('useDashboardItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
    const mockClientInstrumentsSelect = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return { select: mockSelect };
      }
      if (table === 'client_instruments') {
        return { select: mockClientInstrumentsSelect };
      }
      return { select: jest.fn() };
    });

    const { result } = renderHook(() => useDashboardItems());

    // Initially loading should be true
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.submitting).toBe(false);
    expect(result.current.itemImages).toEqual([]);
    expect(result.current.uploadingImages).toBe(false);
    expect(result.current.imagesToDelete).toEqual([]);
    expect(result.current.clientRelationships).toEqual([]);

    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should fetch items on mount', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [mockInstrument],
        error: null,
      }),
    });
    const mockClientInstrumentsSelect = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return { select: mockSelect };
      }
      if (table === 'client_instruments') {
        return { select: mockClientInstrumentsSelect };
      }
      return { select: jest.fn() };
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual(mockInstrument);
  });

  it('should handle fetch items error', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: null,
        error: new Error('Fetch failed'),
      }),
    });
    supabase.from.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
  });

  it('should create item', async () => {
    const { supabase } = require('@/lib/supabase');
    const newInstrument = { ...mockInstrument, id: 'inst2' };
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: newInstrument,
          error: null,
        }),
      }),
    });
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
    const mockClientInstrumentsSelect = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return {
          select: mockSelect,
          insert: mockInsert,
        };
      }
      if (table === 'client_instruments') {
        return { select: mockClientInstrumentsSelect };
      }
      return { select: jest.fn() };
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const created = await result.current.createItem({
        maker: 'Guarneri',
        type: 'Cello',
        subtype: null,
        year: 1750,
        certificate: false,
        size: null,
        weight: null,
        price: 50000,
        ownership: null,
        note: null,
        serial_number: 'CE0000001',
        status: 'Available',
      });
      expect(created).toEqual(newInstrument);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.submitting).toBe(false);
  });

  it('should update item', async () => {
    const { supabase } = require('@/lib/supabase');
    const updatedInstrument = { ...mockInstrument, price: 150000 };
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: updatedInstrument,
            error: null,
          }),
        }),
      }),
    });
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [mockInstrument],
        error: null,
      }),
    });
    const mockClientInstrumentsSelect = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      if (table === 'client_instruments') {
        return { select: mockClientInstrumentsSelect };
      }
      return { select: jest.fn() };
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const updated = await result.current.updateItem('inst1', {
        price: 150000,
      });
      expect(updated).toEqual(updatedInstrument);
    });

    expect(result.current.items[0].price).toBe(150000);
    expect(result.current.submitting).toBe(false);
  });

  it('should delete item', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        error: null,
      }),
    });
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [mockInstrument],
        error: null,
      }),
    });
    const mockClientInstrumentsSelect = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return {
          select: mockSelect,
          delete: mockDelete,
        };
      }
      if (table === 'client_instruments') {
        return { select: mockClientInstrumentsSelect };
      }
      return { select: jest.fn() };
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteItem('inst1');
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('should manage item images', () => {
    const { result } = renderHook(() => useDashboardItems());

    const mockImage: InstrumentImage = {
      id: 'img1',
      instrument_id: 'inst1',
      image_url: 'https://example.com/image.jpg',
      alt_text: 'Test image',
      file_name: 'image.jpg',
      file_size: 1000,
      mime_type: 'image/jpeg',
      display_order: 1,
      created_at: '2024-01-01',
    };

    act(() => {
      result.current.addItemImage(mockImage);
    });

    expect(result.current.itemImages).toHaveLength(1);
    expect(result.current.itemImages[0]).toEqual(mockImage);

    act(() => {
      result.current.removeItemImage('img1');
    });

    expect(result.current.itemImages).toHaveLength(0);
  });

  it('should manage client relationships', () => {
    const { result } = renderHook(() => useDashboardItems());

    const mockRelationship: ClientInstrument = {
      id: 'rel1',
      client_id: 'c1',
      instrument_id: 'inst1',
      relationship_type: 'Owned',
      notes: null,
      created_at: '2024-01-01',
    };

    act(() => {
      result.current.addClientRelationship(mockRelationship);
    });

    expect(result.current.clientRelationships).toHaveLength(1);
    expect(result.current.clientRelationships[0]).toEqual(mockRelationship);

    act(() => {
      result.current.removeClientRelationship('rel1');
    });

    expect(result.current.clientRelationships).toHaveLength(0);
  });

  it('should update uploadingImages state', () => {
    const { result } = renderHook(() => useDashboardItems());

    act(() => {
      result.current.setUploadingImages(true);
    });

    expect(result.current.uploadingImages).toBe(true);
  });

  it('should update imagesToDelete state', () => {
    const { result } = renderHook(() => useDashboardItems());

    act(() => {
      result.current.setImagesToDelete(['img1', 'img2']);
    });

    expect(result.current.imagesToDelete).toEqual(['img1', 'img2']);
  });
});
