import { renderHook, act } from '@testing-library/react';
import { useInstrumentSearch } from '../useInstrumentSearch';
import { Instrument } from '@/types';

const instruments: Instrument[] = [
  {
    id: '1',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: null,
    year: 1700,
    certificate: true,
    size: null,
    weight: null,
    price: null,
    ownership: null,
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    maker: 'Guarneri',
    type: 'Violin',
    subtype: null,
    year: 1750,
    certificate: false,
    size: null,
    weight: null,
    price: null,
    ownership: null,
    note: null,
    serial_number: 'VI0000002',
    status: 'Available',
    created_at: '2023-01-02T00:00:00Z',
  },
];

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedInstruments: () => ({
    instruments,
  }),
}));

describe('useInstrumentSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    expect(result.current.showInstrumentSearch).toBe(false);
    expect(result.current.instrumentSearchTerm).toBe('');
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearchingInstruments).toBe(false);
  });

  it('should open instrument search', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    act(() => {
      result.current.openInstrumentSearch();
    });

    expect(result.current.showInstrumentSearch).toBe(true);
  });

  it('should close instrument search and clear search term', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    act(() => {
      result.current.openInstrumentSearch();
      result.current.handleInstrumentSearch('test');
    });

    expect(result.current.showInstrumentSearch).toBe(true);
    expect(result.current.instrumentSearchTerm).toBe('test');

    act(() => {
      result.current.closeInstrumentSearch();
    });

    expect(result.current.showInstrumentSearch).toBe(false);
    expect(result.current.instrumentSearchTerm).toBe('');
  });

  it('should not search when term length is less than 2', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    act(() => {
      result.current.handleInstrumentSearch('t');
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearchingInstruments).toBe(false);
  });

  it('should search when term length is 2 or more', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    act(() => {
      result.current.handleInstrumentSearch('vi');
    });

    expect(result.current.searchResults).toEqual(instruments);
    expect(result.current.instrumentSearchTerm).toBe('vi');
    expect(result.current.isSearchingInstruments).toBe(false);
  });

  it('should filter search results by maker/serial/type/subtype', () => {
    const { result } = renderHook(() => useInstrumentSearch());

    act(() => {
      result.current.handleInstrumentSearch('0000002');
    });

    expect(result.current.searchResults).toEqual([instruments[1]]);
  });

  it('should update instrumentSearchTerm when searching', async () => {
    const { result } = renderHook(() => useInstrumentSearch());

    await act(async () => {
      await result.current.handleInstrumentSearch('violin');
    });

    expect(result.current.instrumentSearchTerm).toBe('violin');
  });
});
