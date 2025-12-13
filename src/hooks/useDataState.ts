// src/hooks/useDataState.ts
import { useState, useCallback, useRef } from 'react';

// generic data state management hook
export function useDataState<T>(
  getId: (item: T) => string,
  initialState: T[] = []
) {
  const [data, setData] = useState<T[]>(initialState);

  const addItem = useCallback((item: T) => {
    setData(prev => [item, ...prev]);
  }, []);

  const updateItem = useCallback(
    (id: string, updatedItem: T) => {
      setData(prev =>
        prev.map(item => (getId(item) === id ? updatedItem : item))
      );
    },
    [getId]
  );

  const removeItem = useCallback(
    (id: string) => {
      setData(prev => prev.filter(item => getId(item) !== id));
    },
    [getId]
  );

  const setItems = useCallback((items: T[]) => {
    setData(items);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
  }, []);

  // FIXED: Deprecated functions now warn in development to help identify old code
  const warnedRef = useRef({ loading: false, error: false });
  const setLoading = useCallback(() => {
    if (process.env.NODE_ENV === 'development' && !warnedRef.current.loading) {
      console.warn(
        'useDataState.setLoading is deprecated and no-op. Remove this call.'
      );
      warnedRef.current.loading = true;
    }
  }, []);

  const setError = useCallback(() => {
    if (process.env.NODE_ENV === 'development' && !warnedRef.current.error) {
      console.warn(
        'useDataState.setError is deprecated and no-op. Remove this call.'
      );
      warnedRef.current.error = true;
    }
  }, []);

  return {
    data,
    setLoading,
    setError,
    addItem,
    updateItem,
    removeItem,
    setItems,
    clearData,
  };
}

// search results state management hook
export function useSearchBoxState<T>(initialState: T[] = []) {
  const [searchResults, setSearchResults] = useState<T[]>(initialState);
  const [isSearching, setIsSearching] = useState(false);

  const setResults = useCallback((results: T[]) => {
    setSearchResults(results);
  }, []);

  const clearResults = useCallback(() => {
    setSearchResults([]);
  }, []);

  const startSearch = useCallback(() => {
    setIsSearching(true);
  }, []);

  const stopSearch = useCallback(() => {
    setIsSearching(false);
  }, []);

  return {
    searchResults,
    isSearching,
    setResults,
    clearResults,
    startSearch,
    stopSearch,
  };
}
