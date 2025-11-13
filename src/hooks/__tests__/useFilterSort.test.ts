import { renderHook, act, waitFor } from '@testing-library/react';
import { useFilterSort } from '../useFilterSort';

describe('useFilterSort', () => {
  interface TestItem {
    id: string;
    name?: string;
    value: number;
    date?: string;
    tags?: string[];
  }

  const items: TestItem[] = [
    { id: '1', name: 'Apple', value: 10, date: '2024-01-01', tags: ['fruit'] },
    { id: '2', name: 'Banana', value: 5, date: '2024-01-02', tags: ['fruit'] },
    { id: '3', name: 'Cherry', value: 15, date: '2024-01-03', tags: ['fruit'] },
    { id: '4', name: 'Date', value: 20, date: '2024-01-04' },
  ];

  describe('search functionality', () => {
    it('should initialize with empty search term', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name'] })
      );

      expect(result.current.searchTerm).toBe('');
      expect(result.current.items).toEqual(items);
    });

    it('should initialize with initial search term', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          searchFields: ['name'],
          initialSearchTerm: 'Apple',
        })
      );

      expect(result.current.searchTerm).toBe('Apple');
    });

    it('should filter items by search term', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name'] })
      );

      act(() => {
        result.current.setSearchTerm('Apple');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Apple');
      });
    });

    it('should filter items case-insensitively', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name'] })
      );

      act(() => {
        result.current.setSearchTerm('apple');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Apple');
      });
    });

    it('should filter items by multiple fields', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name', 'id'] })
      );

      act(() => {
        result.current.setSearchTerm('1');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].id).toBe('1');
      });
    });

    it('should filter items in arrays', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['tags'] })
      );

      act(() => {
        result.current.setSearchTerm('fruit');
      });

      await waitFor(() => {
        expect(result.current.items.length).toBeGreaterThan(0);
        expect(
          result.current.items.every(item => item.tags?.includes('fruit'))
        ).toBe(true);
      });
    });

    it('should use external search term when provided', async () => {
      const { result, rerender } = renderHook(
        ({ externalTerm }) =>
          useFilterSort(items, {
            searchFields: ['name'],
            externalSearchTerm: externalTerm,
          }),
        { initialProps: { externalTerm: 'Apple' } }
      );

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      rerender({ externalTerm: 'Banana' });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Banana');
      });
    });

    it('should use custom filter function', async () => {
      const customFilter = (item: TestItem, term: string) => {
        return item.value.toString().includes(term);
      };

      const { result } = renderHook(() =>
        useFilterSort(items, {
          searchFields: ['name'],
          customFilter,
        })
      );

      act(() => {
        result.current.setSearchTerm('10');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].value).toBe(10);
      });
    });

    it('should debounce search term', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name'], debounceMs: 300 })
      );

      act(() => {
        result.current.setSearchTerm('A');
        result.current.setSearchTerm('Ap');
        result.current.setSearchTerm('App');
        result.current.setSearchTerm('Appl');
        result.current.setSearchTerm('Apple');
      });

      // Before debounce
      expect(result.current.items).toEqual(items);

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Apple');
      });

      jest.useRealTimers();
    });
  });

  describe('sort functionality', () => {
    it('should initialize with default sort', () => {
      const { result } = renderHook(() => useFilterSort(items));

      expect(result.current.sortBy).toBe('');
      expect(result.current.sortOrder).toBe('asc');
      expect(result.current.items).toEqual(items);
    });

    it('should initialize with custom sort', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'desc',
        })
      );

      expect(result.current.sortBy).toBe('name');
      expect(result.current.sortOrder).toBe('desc');
    });

    it('should sort items ascending', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'asc',
        })
      );

      expect(result.current.items[0].name).toBe('Apple');
      expect(result.current.items[1].name).toBe('Banana');
      expect(result.current.items[2].name).toBe('Cherry');
    });

    it('should sort items descending', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'desc',
        })
      );

      expect(result.current.items[0].name).toBe('Date');
      expect(result.current.items[1].name).toBe('Cherry');
      expect(result.current.items[2].name).toBe('Banana');
    });

    it('should sort by numeric values', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'value',
          initialSortOrder: 'asc',
        })
      );

      expect(result.current.items[0].value).toBe(5);
      expect(result.current.items[1].value).toBe(10);
      expect(result.current.items[2].value).toBe(15);
      expect(result.current.items[3].value).toBe(20);
    });

    it('should sort by date values', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'date',
          initialSortOrder: 'asc',
        })
      );

      expect(result.current.items[0].date).toBe('2024-01-01');
      expect(result.current.items[1].date).toBe('2024-01-02');
      expect(result.current.items[2].date).toBe('2024-01-03');
    });

    it('should handle null values in sort', () => {
      const itemsWithNull: TestItem[] = [
        { id: '1', name: 'Apple', value: 10 },
        { id: '2', name: 'Banana', value: 5, date: '2024-01-01' },
      ];

      const { result } = renderHook(() =>
        useFilterSort(itemsWithNull, {
          initialSortBy: 'date',
          initialSortOrder: 'asc',
        })
      );

      // Items with null dates should come after items with dates
      expect(result.current.items[0].date).toBe('2024-01-01');
      expect(result.current.items[1].date).toBeUndefined();
    });

    it('should toggle sort order when clicking same field', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'asc',
        })
      );

      expect(result.current.sortOrder).toBe('asc');

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortOrder).toBe('desc');

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortOrder).toBe('asc');
    });

    it('should set sort order to asc when clicking different field', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'desc',
        })
      );

      act(() => {
        result.current.handleSort('value');
      });

      expect(result.current.sortBy).toBe('value');
      expect(result.current.sortOrder).toBe('asc');
    });

    it('should get sort arrow for current sort field', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'asc',
        })
      );

      expect(result.current.getSortArrow('name')).toBe('↑');
      expect(result.current.getSortArrow('value')).toBe('');
    });

    it('should get sort arrow for descending order', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          initialSortBy: 'name',
          initialSortOrder: 'desc',
        })
      );

      expect(result.current.getSortArrow('name')).toBe('↓');
    });
  });

  describe('combined search and sort', () => {
    it('should filter and sort items', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          searchFields: ['name'],
          initialSortBy: 'value',
          initialSortOrder: 'asc',
        })
      );

      act(() => {
        result.current.setSearchTerm('fruit');
      });

      await waitFor(() => {
        const filteredItems = result.current.items;
        expect(filteredItems.length).toBeGreaterThan(0);
        // Should be sorted by value
        for (let i = 1; i < filteredItems.length; i++) {
          expect(filteredItems[i].value).toBeGreaterThanOrEqual(
            filteredItems[i - 1].value
          );
        }
      });
    });

    it('should update sort after filtering', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, {
          searchFields: ['name'],
        })
      );

      act(() => {
        result.current.setSearchTerm('A');
      });

      await waitFor(() => {
        expect(result.current.items.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.handleSort('value');
      });

      expect(result.current.items[0].value).toBeLessThanOrEqual(
        result.current.items[1]?.value ?? Infinity
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty items array', () => {
      const { result } = renderHook(() =>
        useFilterSort([], { searchFields: ['name'] })
      );

      expect(result.current.items).toEqual([]);
    });

    it('should handle items with missing search fields', async () => {
      const itemsWithMissing: TestItem[] = [
        { id: '1', name: 'Apple', value: 10 },
        { id: '2', name: 'Banana', value: 5 },
        { id: '3', value: 15 }, // Missing name
      ];

      const { result } = renderHook(() =>
        useFilterSort(itemsWithMissing, { searchFields: ['name'] })
      );

      act(() => {
        result.current.setSearchTerm('Apple');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Apple');
      });
    });

    it('should handle items with null values', async () => {
      const itemsWithNull: TestItem[] = [
        { id: '1', name: 'Apple', value: 10, date: null as unknown as string },
        { id: '2', name: 'Banana', value: 5 },
      ];

      const { result } = renderHook(() =>
        useFilterSort(itemsWithNull, { searchFields: ['name'] })
      );

      act(() => {
        result.current.setSearchTerm('Apple');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });
    });

    it('should handle empty search fields array', () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: [] })
      );

      act(() => {
        result.current.setSearchTerm('Apple');
      });

      // With empty searchFields, all items should be returned
      expect(result.current.items).toEqual(items);
    });

    it('should handle whitespace in search term', async () => {
      const { result } = renderHook(() =>
        useFilterSort(items, { searchFields: ['name'] })
      );

      act(() => {
        result.current.setSearchTerm('   Apple   ');
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Apple');
      });
    });
  });
});
