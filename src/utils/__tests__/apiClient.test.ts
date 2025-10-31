import { ApiClient } from '../apiClient';
import { errorHandler } from '../errorHandler';
import { supabase } from '@/lib/supabase';

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      single: jest.fn(),
    })),
  },
}));

jest.mock('../errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn(error => ({
      code: 'ERROR',
      message: 'Test error',
      timestamp: new Date(),
    })),
  },
}));

describe('ApiClient', () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = ApiClient.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ApiClient.getInstance();
      const instance2 = ApiClient.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('query', () => {
    it('should query all items', async () => {
      const mockData = [{ id: '1' }, { id: '2' }];
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await apiClient.query('test_table');

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should query with eq filter', async () => {
      const mockData = [{ id: '1' }];
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
      });

      await apiClient.query('test_table', {
        eq: { column: 'status', value: 'active' },
      });

      expect(mockEq).toHaveBeenCalledWith('status', 'active');
    });

    it('should query with order', async () => {
      const mockData = [{ id: '1' }];
      const mockSelect = jest.fn().mockReturnThis();
      const mockOrder = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        select: mockSelect,
        order: mockOrder,
      });

      await apiClient.query('test_table', {
        order: { column: 'created_at', ascending: false },
      });

      expect(mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should query with limit', async () => {
      const mockData = [{ id: '1' }];
      const mockSelect = jest.fn().mockReturnThis();
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        select: mockSelect,
        limit: mockLimit,
      });

      await apiClient.query('test_table', { limit: 10 });

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should handle query errors', async () => {
      const mockError = { message: 'Query failed' };
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      const result = await apiClient.query('test_table');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(errorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should handle query exceptions', async () => {
      const mockError = new Error('Network error');
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError),
      });

      const result = await apiClient.query('test_table');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create item', async () => {
      const newItem = { name: 'Test' };
      const createdItem = { id: '1', ...newItem };
      const mockInsert = jest.fn().mockReturnThis();
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: createdItem, error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      });

      const result = await apiClient.create('test_table', newItem);

      expect(mockInsert).toHaveBeenCalledWith([newItem]);
      expect(result.data).toEqual(createdItem);
      expect(result.error).toBeNull();
    });

    it('should handle create errors', async () => {
      const mockError = { message: 'Create failed' };
      const mockInsert = jest.fn().mockReturnThis();
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: mockError });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      });

      const result = await apiClient.create('test_table', { name: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should handle create exceptions', async () => {
      const mockError = new Error('Network error');
      const mockInsert = jest.fn().mockReturnThis();
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockRejectedValue(mockError);

      (supabase.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      });

      const result = await apiClient.create('test_table', { name: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update item', async () => {
      const updates = { name: 'Updated' };
      const updatedItem = { id: '1', ...updates };
      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: updatedItem, error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      });

      const result = await apiClient.update('test_table', '1', updates);

      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(result.data).toEqual(updatedItem);
      expect(result.error).toBeNull();
    });

    it('should handle update errors', async () => {
      const mockError = { message: 'Update failed' };
      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: mockError });

      (supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      });

      const result = await apiClient.update('test_table', '1', {
        name: 'Updated',
      });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });

      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete('test_table', '1');

      expect(mockEq).toHaveBeenCalledWith('id', '1');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should handle delete errors', async () => {
      const mockError = { message: 'Delete failed' };
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: mockError });

      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete('test_table', '1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle delete exceptions', async () => {
      const mockError = new Error('Network error');
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockRejectedValue(mockError);

      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete('test_table', '1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
