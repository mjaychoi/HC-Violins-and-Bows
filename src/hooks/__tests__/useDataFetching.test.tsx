import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useDataFetching,
  useInitialData,
  useDependentData,
} from '../useDataFetching';

describe('useDataFetching', () => {
  it('should fetch data on mount', async () => {
    const mockData = [{ id: '1' }, { id: '2' }];
    const mockFetch = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useDataFetching(mockFetch, 'test'));

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should fetch data with parameters', async () => {
    const mockData = [{ id: '1' }];
    const mockFetch = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useDataFetching(mockFetch, 'test', ['param1'])
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    const mockError = new Error('Fetch failed');
    const mockFetch = jest.fn().mockRejectedValue(mockError);

    const { result } = renderHook(() => useDataFetching(mockFetch, 'test'));

    await waitFor(() => {
      expect(result.current.items).toEqual([]);
    });
  });

  it('should refetch data when dependencies change', async () => {
    const mockFetch = jest.fn().mockResolvedValue([]);
    const { rerender } = renderHook(
      ({ deps }) => useDataFetching(mockFetch, 'test', deps),
      { initialProps: { deps: ['dep1'] } }
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    rerender({ deps: ['dep2'] });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('should manually fetch data', async () => {
    const mockData = [{ id: '1' }];
    const mockFetch = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useDataFetching(mockFetch, 'test', []));

    // Wait for initial render
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const newData = [{ id: '2' }];
    mockFetch.mockResolvedValue(newData);

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.items).toEqual(newData);
  });

  it('should update items with setItems', () => {
    const mockFetch = jest.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useDataFetching(mockFetch, 'test'));

    const newItems = [{ id: '1' }];

    act(() => {
      result.current.setItems(newItems);
    });

    expect(result.current.items).toEqual(newItems);
  });
});

describe('useInitialData', () => {
  it('should fetch data on mount', async () => {
    const mockData = [{ id: '1' }];
    const mockFetch = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useInitialData(mockFetch, 'test'));

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });
  });
});

describe('useDependentData', () => {
  it('should fetch data based on dependencies', async () => {
    const mockData = [{ id: '1' }];
    const mockFetch = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useDependentData(mockFetch, 'test', ['dep1', 'dep2'])
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });
  });
});
