import { renderHook } from '@testing-library/react';
import { useEnrichedSales } from '../useEnrichedSales';
import { Client, Instrument, SalesHistory } from '@/types';

const mockClients: Client[] = [
  {
    id: 'client-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: [],
    interest: '',
    note: '',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'client-2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '987-654-3210',
    tags: [],
    interest: '',
    note: '',
    client_number: null,
    created_at: '2024-01-02T00:00:00Z',
  },
];

const mockInstruments: Instrument[] = [
  {
    id: 'instrument-1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: '4/4',
    serial_number: 'SN123',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: null,
    certificate: true,
    status: 'Available' as const,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockSales: SalesHistory[] = [
  {
    id: 'sale-1',
    client_id: 'client-1',
    instrument_id: 'instrument-1',
    sale_price: 1000,
    sale_date: '2024-01-15',
    notes: 'Test sale',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'sale-2',
    client_id: 'client-2',
    instrument_id: null,
    sale_price: 500,
    sale_date: '2024-01-20',
    notes: null,
    created_at: '2024-01-20T00:00:00Z',
  },
];

describe('useEnrichedSales', () => {
  it('enriches sales with client and instrument data', () => {
    const { result } = renderHook(() =>
      useEnrichedSales(
        mockSales,
        mockClients,
        mockInstruments,
        'sale_date',
        'desc'
      )
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0].client).toEqual(mockClients[0]);
    expect(result.current[0].instrument).toEqual(mockInstruments[0]);
    expect(result.current[1].client).toEqual(mockClients[1]);
    expect(result.current[1].instrument).toBeUndefined();
  });

  it('sorts by client_name ascending', () => {
    const { result } = renderHook(() =>
      useEnrichedSales(
        mockSales,
        mockClients,
        mockInstruments,
        'client_name',
        'asc'
      )
    );

    // Jane Smith should come before John Doe alphabetically
    expect(result.current[0].client?.first_name).toBe('Jane');
    expect(result.current[1].client?.first_name).toBe('John');
  });

  it('sorts by client_name descending', () => {
    const { result } = renderHook(() =>
      useEnrichedSales(
        mockSales,
        mockClients,
        mockInstruments,
        'client_name',
        'desc'
      )
    );

    // John Doe should come before Jane Smith in descending order
    expect(result.current[0].client?.first_name).toBe('John');
    expect(result.current[1].client?.first_name).toBe('Jane');
  });

  it('does not sort when sortColumn is not client_name', () => {
    const { result } = renderHook(() =>
      useEnrichedSales(
        mockSales,
        mockClients,
        mockInstruments,
        'sale_date',
        'desc'
      )
    );

    // Should maintain original order (client_name sorting only happens when sortColumn is 'client_name')
    expect(result.current[0].client?.first_name).toBe('John');
    expect(result.current[1].client?.first_name).toBe('Jane');
  });

  it('handles empty sales array', () => {
    const { result } = renderHook(() =>
      useEnrichedSales([], mockClients, mockInstruments, 'sale_date', 'desc')
    );

    expect(result.current).toHaveLength(0);
  });

  it('handles empty clients and instruments arrays', () => {
    const { result } = renderHook(() =>
      useEnrichedSales(mockSales, [], [], 'sale_date', 'desc')
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0].client).toBeUndefined();
    expect(result.current[0].instrument).toBeUndefined();
  });

  it('recomputes when sales array reference changes', () => {
    const { result, rerender } = renderHook(
      ({ sales }) =>
        useEnrichedSales(
          sales,
          mockClients,
          mockInstruments,
          'sale_date',
          'desc'
        ),
      {
        initialProps: { sales: mockSales },
      }
    );

    const firstResult = result.current;

    // Rerender with new array (different reference, same contents)
    rerender({ sales: [...mockSales] });

    // Should return new array reference (even if contents are same)
    // useMemo dependencies include sales array reference
    expect(result.current).not.toBe(firstResult);
  });

  it('recomputes when sales change', () => {
    const { result, rerender } = renderHook(
      ({ sales }) =>
        useEnrichedSales(
          sales,
          mockClients,
          mockInstruments,
          'sale_date',
          'desc'
        ),
      {
        initialProps: { sales: mockSales },
      }
    );

    const firstResult = result.current;

    const newSales = [
      ...mockSales,
      {
        id: 'sale-3',
        client_id: 'client-1',
        instrument_id: null,
        sale_price: 750,
        sale_date: '2024-01-25',
        notes: null,
        created_at: '2024-01-25T00:00:00Z',
      },
    ];

    rerender({ sales: newSales });

    // Should return new array with different length
    expect(result.current).not.toBe(firstResult);
    expect(result.current).toHaveLength(3);
  });
});
