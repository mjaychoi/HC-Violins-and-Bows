// Additional coverage for useFilters: per-field counts and state updates
import { renderHook, act } from '@/test-utils/render';
import { useFilters } from '../useFilters';
import { Client } from '@/types';

const clients: Client[] = [
  {
    id: '1',
    first_name: 'Alpha',
    last_name: 'One',
    email: 'alpha@example.com',
    contact_number: '111',
    tags: ['A'],
    interest: 'High',
    note: '',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('useFilters additional counts', () => {
  it('counts last_name filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('last_name', 'One'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts first_name filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('first_name', 'Alpha'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts contact_number filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('contact_number', '111'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts email filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('email', 'alpha@example.com'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts tags filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('tags', 'A'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts interest filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleFilterChange('interest', 'High'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts hasInstruments filter', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.handleHasInstrumentsChange('Has Instruments'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('counts searchTerm independently from filters', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => result.current.setSearchTerm('Alpha'));
    expect(result.current.getActiveFiltersCount()).toBe(1);
    act(() => result.current.handleFilterChange('tags', 'A'));
    expect(result.current.getActiveFiltersCount()).toBe(2);
  });

  it('counts all fields when setFilters is called directly', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => {
      result.current.setFilters({
        last_name: ['One'],
        first_name: ['Alpha'],
        contact_number: ['111'],
        email: ['alpha@example.com'],
        tags: ['A'],
        interest: ['High'],
        hasInstruments: ['Has Instruments'],
      });
    });
    expect(result.current.getActiveFiltersCount()).toBe(7);
  });

  it('clearAllFilters resets counts after direct setFilters', () => {
    const { result } = renderHook(() => useFilters(clients, new Set()));
    act(() => {
      result.current.setFilters({
        last_name: ['One'],
        first_name: ['Alpha'],
        contact_number: ['111'],
        email: ['alpha@example.com'],
        tags: ['A'],
        interest: ['High'],
        hasInstruments: ['Has Instruments'],
      });
      result.current.setSearchTerm('Alpha');
    });
    expect(result.current.getActiveFiltersCount()).toBe(8);
    act(() => result.current.clearAllFilters());
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });
});
