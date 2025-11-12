import { renderHook, act } from '@testing-library/react';
import { useDataState, useSearchBoxState } from '../useDataState';

describe('useDataState', () => {
  interface TestItem {
    id: string;
    name: string;
    value?: number;
  }

  const getId = (item: TestItem) => item.id;

  describe('useDataState', () => {
    it('should initialize with empty array', () => {
      const { result } = renderHook(() => useDataState(getId));

      expect(result.current.data).toEqual([]);
    });

    it('should initialize with initial state', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));

      expect(result.current.data).toEqual(initialState);
    });

    it('should add item', () => {
      const { result } = renderHook(() => useDataState(getId));
      const newItem: TestItem = { id: '1', name: 'New Item' };

      act(() => {
        result.current.addItem(newItem);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0]).toEqual(newItem);
    });

    it('should add multiple items', () => {
      const { result } = renderHook(() => useDataState(getId));
      const item1: TestItem = { id: '1', name: 'Item 1' };
      const item2: TestItem = { id: '2', name: 'Item 2' };

      act(() => {
        result.current.addItem(item1);
        result.current.addItem(item2);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0]).toEqual(item2); // New items are added to the beginning
      expect(result.current.data[1]).toEqual(item1);
    });

    it('should update item', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));
      const updatedItem: TestItem = { id: '1', name: 'Updated Item 1', value: 100 };

      act(() => {
        result.current.updateItem('1', updatedItem);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0]).toEqual(updatedItem);
      expect(result.current.data[1]).toEqual({ id: '2', name: 'Item 2' });
    });

    it('should not update item if id does not exist', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));
      const updatedItem: TestItem = { id: '3', name: 'Item 3' };

      act(() => {
        result.current.updateItem('3', updatedItem);
      });

      expect(result.current.data).toEqual(initialState);
    });

    it('should remove item', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));

      act(() => {
        result.current.removeItem('2');
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data.find(item => item.id === '2')).toBeUndefined();
      expect(result.current.data).toEqual([
        { id: '1', name: 'Item 1' },
        { id: '3', name: 'Item 3' },
      ]);
    });

    it('should not remove item if id does not exist', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));

      act(() => {
        result.current.removeItem('3');
      });

      expect(result.current.data).toEqual(initialState);
    });

    it('should set items', () => {
      const initialState: TestItem[] = [{ id: '1', name: 'Item 1' }];
      const { result } = renderHook(() => useDataState(getId, initialState));
      const newItems: TestItem[] = [
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];

      act(() => {
        result.current.setItems(newItems);
      });

      expect(result.current.data).toEqual(newItems);
      expect(result.current.data).toHaveLength(2);
    });

    it('should clear data', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useDataState(getId, initialState));

      act(() => {
        result.current.clearData();
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.data).toHaveLength(0);
    });

    it('should maintain referential stability for getId callback', () => {
      const getId1 = (item: TestItem) => item.id;
      const { result, rerender } = renderHook(
        ({ getId }) => useDataState(getId),
        { initialProps: { getId: getId1 } }
      );

      const getId2 = (item: TestItem) => item.id;
      rerender({ getId: getId2 });

      // Should work the same way
      const item: TestItem = { id: '1', name: 'Item 1' };
      act(() => {
        result.current.addItem(item);
      });

      expect(result.current.data).toHaveLength(1);
    });

    it('should handle complex items', () => {
      interface ComplexItem {
        id: string;
        data: {
          nested: {
            value: number;
          };
        };
      }

      const getId = (item: ComplexItem) => item.id;
      const { result } = renderHook(() => useDataState(getId));
      const item: ComplexItem = {
        id: '1',
        data: {
          nested: {
            value: 42,
          },
        },
      };

      act(() => {
        result.current.addItem(item);
      });

      expect(result.current.data[0]).toEqual(item);
    });

    it('should provide deprecated setLoading and setError functions', () => {
      const { result } = renderHook(() => useDataState(getId));

      // These should not throw errors
      expect(() => {
        result.current.setLoading();
      }).not.toThrow();

      expect(() => {
        result.current.setError();
      }).not.toThrow();
    });
  });

  describe('useSearchBoxState', () => {
    it('should initialize with empty results', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());

      expect(result.current.searchResults).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });

    it('should initialize with initial state', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useSearchBoxState(initialState));

      expect(result.current.searchResults).toEqual(initialState);
      expect(result.current.isSearching).toBe(false);
    });

    it('should set results', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());
      const results: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      act(() => {
        result.current.setResults(results);
      });

      expect(result.current.searchResults).toEqual(results);
    });

    it('should clear results', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useSearchBoxState(initialState));

      act(() => {
        result.current.clearResults();
      });

      expect(result.current.searchResults).toEqual([]);
    });

    it('should start search', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());

      act(() => {
        result.current.startSearch();
      });

      expect(result.current.isSearching).toBe(true);
    });

    it('should stop search', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());

      act(() => {
        result.current.startSearch();
      });

      expect(result.current.isSearching).toBe(true);

      act(() => {
        result.current.stopSearch();
      });

      expect(result.current.isSearching).toBe(false);
    });

    it('should toggle search state', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());

      act(() => {
        result.current.startSearch();
      });
      expect(result.current.isSearching).toBe(true);

      act(() => {
        result.current.stopSearch();
      });
      expect(result.current.isSearching).toBe(false);

      act(() => {
        result.current.startSearch();
      });
      expect(result.current.isSearching).toBe(true);
    });

    it('should handle multiple search operations', () => {
      const { result } = renderHook(() => useSearchBoxState<TestItem>());
      const results1: TestItem[] = [{ id: '1', name: 'Item 1' }];
      const results2: TestItem[] = [
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];

      act(() => {
        result.current.startSearch();
        result.current.setResults(results1);
        result.current.setResults(results2);
        result.current.stopSearch();
      });

      expect(result.current.searchResults).toEqual(results2);
      expect(result.current.isSearching).toBe(false);
    });

    it('should clear results while searching', () => {
      const initialState: TestItem[] = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const { result } = renderHook(() => useSearchBoxState(initialState));

      act(() => {
        result.current.startSearch();
        result.current.clearResults();
      });

      expect(result.current.searchResults).toEqual([]);
      expect(result.current.isSearching).toBe(true);
    });
  });
});

