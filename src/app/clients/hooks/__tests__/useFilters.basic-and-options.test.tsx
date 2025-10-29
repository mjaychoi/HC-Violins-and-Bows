// src/app/clients/hooks/__tests__/useFilters.basic-and-options.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useFilters } from '../useFilters';
import { Client } from '@/types';

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test client',
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '098-765-4321',
    tags: ['Owner'],
    interest: 'Passive',
    note: 'Another test client',
    created_at: '2023-01-02T00:00:00Z',
  },
  {
    id: '3',
    first_name: 'Bob',
    last_name: 'Johnson',
    email: 'bob@example.com',
    contact_number: '555-123-4567',
    tags: ['Dealer'],
    interest: 'Inactive',
    note: 'Third test client',
    created_at: '2023-01-03T00:00:00Z',
  },
];

const mockClientsWithInstruments = new Set(['1', '2']);

describe('useFilters - 기본 필터 & 옵션', () => {
  it('기본값 초기화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    expect(result.current.searchTerm).toBe('');
    expect(result.current.showFilters).toBe(false);
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.filteredClients).toHaveLength(mockClients.length);
    mockClients.forEach(client => {
      expect(result.current.filteredClients).toContainEqual(client);
    });
  });

  it('검색어 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.setSearchTerm('John');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(1);
    const johnClient = result.current.filteredClients.find(
      c => c.first_name === 'John'
    );
    expect(johnClient).toBeDefined();
    expect(johnClient?.first_name).toBe('John');
  });

  it('성/이름/이메일/태그/관심도/보유악기 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('last_name', 'Doe');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].last_name).toBe('Doe');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('first_name', 'Jane');
    });
    expect(result.current.filteredClients[0].first_name).toBe('Jane');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('email', 'john@example.com');
    });
    expect(result.current.filteredClients[0].email).toBe('john@example.com');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filteredClients[0].tags).toContain('Musician');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.filteredClients[0].interest).toBe('Active');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('hasInstruments', 'Has Instruments');
    });
    expect(result.current.filteredClients).toHaveLength(2);
  });

  it('보유악기 없음 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('hasInstruments', 'No Instruments');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].first_name).toBe('Bob');
  });

  it('복합 필터 조합', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].first_name).toBe('John');
  });

  it('필터 토글 및 전체 초기화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).toContain('Musician');
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).not.toContain('Musician');

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('John');
    });
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.searchTerm).toBe('John');
    act(() => {
      result.current.clearAllFilters();
    });
    expect(result.current.filters.tags).toEqual([]);
    expect(result.current.filters.interest).toEqual([]);
    expect(result.current.searchTerm).toBe('');
  });

  it('옵션 생성 및 빈 목록/널 값 처리', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    expect(result.current.filterOptions.lastNames).toEqual(
      expect.arrayContaining(['Doe', 'Smith', 'Johnson'])
    );
    expect(result.current.filterOptions.tags).toEqual(
      expect.arrayContaining(['Musician', 'Owner', 'Dealer'])
    );

    const { result: empty } = renderHook(() => useFilters([], new Set()));
    expect(empty.current.filteredClients).toEqual([]);
    expect(empty.current.filterOptions.lastNames).toEqual([]);

    const clientsWithNulls: Client[] = [
      {
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        contact_number: null,
        tags: [],
        interest: null,
        note: null,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];
    const { result: withNulls } = renderHook(() =>
      useFilters(clientsWithNulls, new Set())
    );
    expect(withNulls.current.filteredClients).toEqual(clientsWithNulls);
  });
});
