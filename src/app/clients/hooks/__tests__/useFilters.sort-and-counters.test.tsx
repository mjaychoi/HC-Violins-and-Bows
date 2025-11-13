// src/app/clients/hooks/__tests__/useFilters.sort-and-counters.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useFilters } from '../useFilters';
import { Client } from '@/types';

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '1',
    tags: ['Musician'],
    interest: 'Active',
    note: '',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '2',
    tags: ['Owner'],
    interest: 'Passive',
    note: '',
    client_number: null,
    created_at: '2023-01-02T00:00:00Z',
  },
];

describe('useFilters - 정렬/카운트/표시', () => {
  it('컬럼 정렬 및 토글', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('desc');
  });

  it('정렬 표시 화살표', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('last_name')).toBe('');
  });

  it('활성 필터 수 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);
  });
});
