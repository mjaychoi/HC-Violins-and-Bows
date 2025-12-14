import { renderHook, act, waitFor } from '@/test-utils/render';
import { useSupabaseQuery } from '../useSupabaseQuery';

// Mock apiClient
jest.mock('@/utils/apiClient', () => ({
  apiClient: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Get mocked functions
const { apiClient } = require('@/utils/apiClient');
const mockQuery = apiClient.query;
const mockCreate = apiClient.create;
const mockUpdate = apiClient.update;
const mockDelete = apiClient.delete;

// Mock useErrorHandler
const mockHandleError = jest.fn(error => error);

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

describe('useSupabaseQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ data: [], error: null });
    mockCreate.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockResolvedValue({ data: null, error: null });
    mockDelete.mockResolvedValue({ success: true, error: null });
  });

  describe('initialization', () => {
    it('should initialize with empty data and no loading', () => {
      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('fetch', () => {
    it('should fetch data successfully', async () => {
      const mockData = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' },
      ];
      mockQuery.mockResolvedValue({ data: mockData, error: null });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        await result.current.fetch();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBe(null);
      expect(mockQuery).toHaveBeenCalledWith('test_table', undefined);
    });

    it('should handle fetch with options', async () => {
      const mockData = [{ id: '1', name: 'Test 1' }];
      mockQuery.mockResolvedValue({ data: mockData, error: null });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      const options = {
        select: 'id,name',
        eq: { column: 'status', value: 'active' },
        order: { column: 'name', ascending: true },
        limit: 10,
      };

      await act(async () => {
        await result.current.fetch(options);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockQuery).toHaveBeenCalledWith('test_table', options);
      expect(result.current.data).toEqual(mockData);
    });

    it('should handle fetch error', async () => {
      const mockError = { message: 'Fetch failed' };
      mockQuery.mockResolvedValue({ data: null, error: mockError });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        await result.current.fetch();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(mockError);
      expect(result.current.data).toEqual([]);
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Fetch test_table'
      );
    });

    it('should handle fetch exception', async () => {
      const mockError = new Error('Network error');
      mockQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        await result.current.fetch();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Fetch test_table'
      );
    });

    it('should ignore stale requests', async () => {
      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      // Start first request
      act(() => {
        result.current.fetch();
      });

      // Start second request before first completes
      await act(async () => {
        await result.current.fetch();
      });

      // First request should be ignored when it completes
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('should create data successfully', async () => {
      const newData = { name: 'New Item' };
      const createdData = { id: '1', ...newData };
      mockCreate.mockResolvedValue({ data: createdData, error: null });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const result_data = await result.current.create(newData);
        expect(result_data).toEqual(createdData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toContainEqual(createdData);
      expect(mockCreate).toHaveBeenCalledWith('test_table', newData);
    });

    it('should handle create error', async () => {
      const newData = { name: 'New Item' };
      const mockError = { message: 'Create failed' };
      mockCreate.mockResolvedValue({ data: null, error: mockError });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const result_data = await result.current.create(newData);
        expect(result_data).toBeNull();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(mockError);
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Create test_table'
      );
    });

    it('should handle create exception', async () => {
      const newData = { name: 'New Item' };
      const mockError = new Error('Network error');
      mockCreate.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const result_data = await result.current.create(newData);
        expect(result_data).toBeNull();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Create test_table'
      );
    });
  });

  describe('update', () => {
    it('should update data successfully', async () => {
      const existingData = { id: '1', name: 'Old Name' };
      const updateData = { name: 'New Name' };
      const updatedData = { id: '1', name: 'New Name' };

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      // Set initial data
      act(() => {
        result.current.setData([existingData]);
      });

      mockUpdate.mockResolvedValue({ data: updatedData, error: null });

      await act(async () => {
        const result_data = await result.current.update('1', updateData);
        expect(result_data).toEqual(updatedData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toContainEqual(updatedData);
      expect(result.current.data).not.toContainEqual(existingData);
      expect(mockUpdate).toHaveBeenCalledWith('test_table', '1', updateData);
    });

    it('should handle update error', async () => {
      const updateData = { name: 'New Name' };
      const mockError = { message: 'Update failed' };
      mockUpdate.mockResolvedValue({ data: null, error: mockError });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const result_data = await result.current.update('1', updateData);
        expect(result_data).toBeNull();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(mockError);
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Update test_table'
      );
    });

    it('should handle update exception', async () => {
      const updateData = { name: 'New Name' };
      const mockError = new Error('Network error');
      mockUpdate.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const result_data = await result.current.update('1', updateData);
        expect(result_data).toBeNull();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Update test_table'
      );
    });
  });

  describe('remove', () => {
    it('should remove data successfully', async () => {
      const existingData = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      // Set initial data
      act(() => {
        result.current.setData(existingData);
      });

      mockDelete.mockResolvedValue({ success: true, error: null });

      await act(async () => {
        const success = await result.current.remove('1');
        expect(success).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data).not.toContainEqual(existingData[0]);
      expect(result.current.data).toContainEqual(existingData[1]);
      expect(mockDelete).toHaveBeenCalledWith('test_table', '1');
    });

    it('should handle remove error', async () => {
      const mockError = { message: 'Delete failed' };
      mockDelete.mockResolvedValue({ success: false, error: mockError });

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const success = await result.current.remove('1');
        expect(success).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(mockError);
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Delete test_table'
      );
    });

    it('should handle remove exception', async () => {
      const mockError = new Error('Network error');
      mockDelete.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSupabaseQuery('test_table'));

      await act(async () => {
        const success = await result.current.remove('1');
        expect(success).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(mockHandleError).toHaveBeenCalledWith(
        mockError,
        'Delete test_table'
      );
    });
  });

  describe('setData', () => {
    it('should update data directly', () => {
      const { result } = renderHook(() => useSupabaseQuery('test_table'));
      const newData = [{ id: '1', name: 'Test' }];

      act(() => {
        result.current.setData(newData);
      });

      expect(result.current.data).toEqual(newData);
    });
  });
});
