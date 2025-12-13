import { renderHook, act } from '@testing-library/react';
import { useConnectionFilters } from '../useConnectionFilters';
import { ClientInstrument, Client, Instrument } from '@/types';

const mockClient: Client = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
};

const mockInstrument: Instrument = {
  id: 'i1',
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
  created_at: '2024-01-01',
};

const mockConnections: ClientInstrument[] = [
  {
    id: 'conn1',
    client_id: 'c1',
    instrument_id: 'i1',
    relationship_type: 'Interested',
    notes: 'Test notes 1',
    created_at: '2024-01-01',
    client: mockClient,
    instrument: mockInstrument,
  },
  {
    id: 'conn2',
    client_id: 'c1',
    instrument_id: 'i1',
    relationship_type: 'Owned',
    notes: 'Test notes 2',
    created_at: '2024-01-02',
    client: mockClient,
    instrument: mockInstrument,
  },
  {
    id: 'conn3',
    client_id: 'c1',
    instrument_id: 'i1',
    relationship_type: 'Interested',
    notes: 'Test notes 3',
    created_at: '2024-01-03',
    client: mockClient,
    instrument: mockInstrument,
  },
];

describe('useConnectionFilters', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useConnectionFilters([]));

    expect(result.current.selectedFilter).toBeNull();
    expect(result.current.groupedConnections).toEqual({});
    expect(result.current.relationshipTypeCounts).toEqual([]);
  });

  it('should group connections by type', () => {
    const { result } = renderHook(() => useConnectionFilters(mockConnections));

    expect(result.current.groupedConnections).toHaveProperty('Interested');
    expect(result.current.groupedConnections).toHaveProperty('Owned');
    expect(result.current.groupedConnections['Interested']).toHaveLength(2);
    expect(result.current.groupedConnections['Owned']).toHaveLength(1);
  });

  it('should calculate relationship type counts in fixed order', () => {
    const { result } = renderHook(() => useConnectionFilters(mockConnections));

    expect(result.current.relationshipTypeCounts).toHaveLength(2);
    // Should be in fixed order: Interested → Booked → Sold → Owned
    expect(result.current.relationshipTypeCounts[0].type).toBe('Interested');
    expect(result.current.relationshipTypeCounts[0].count).toBe(2);
    expect(result.current.relationshipTypeCounts[1].type).toBe('Owned');
    expect(result.current.relationshipTypeCounts[1].count).toBe(1);
  });

  it('should update selectedFilter when setSelectedFilter is called', () => {
    const { result } = renderHook(() => useConnectionFilters(mockConnections));

    expect(result.current.selectedFilter).toBeNull();

    act(() => {
      result.current.setSelectedFilter('Interested');
    });

    expect(result.current.selectedFilter).toBe('Interested');
  });

  it('should handle empty connections array', () => {
    const { result } = renderHook(() => useConnectionFilters([]));

    expect(result.current.groupedConnections).toEqual({});
    expect(result.current.relationshipTypeCounts).toEqual([]);
  });

  it('should memoize groupedConnections', () => {
    const { result, rerender } = renderHook(
      ({ connections }) => useConnectionFilters(connections),
      {
        initialProps: { connections: mockConnections },
      }
    );

    const firstGrouped = result.current.groupedConnections;

    rerender({ connections: mockConnections });

    expect(result.current.groupedConnections).toBe(firstGrouped);
  });

  it('should recalculate when connections change', () => {
    const { result, rerender } = renderHook(
      ({ connections }) => useConnectionFilters(connections),
      {
        initialProps: { connections: mockConnections },
      }
    );

    const newConnections: ClientInstrument[] = [
      ...mockConnections,
      {
        id: 'conn4',
        client_id: 'c1',
        instrument_id: 'i1',
        relationship_type: 'Booked',
        notes: 'Test notes 4',
        created_at: '2024-01-04',
        client: mockClient,
        instrument: mockInstrument,
      },
    ];

    rerender({ connections: newConnections });

    expect(result.current.groupedConnections).toHaveProperty('Booked');
    expect(result.current.groupedConnections['Booked']).toHaveLength(1);
    expect(result.current.relationshipTypeCounts).toHaveLength(3);
  });
});

