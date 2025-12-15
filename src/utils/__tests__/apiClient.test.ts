import { ApiClient } from '../apiClient';
import { ALLOWED_SORT_COLUMNS } from '../inputValidation';
import { errorHandler } from '../errorHandler';

// Mock dependencies
const mockSupabaseClient = {
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
};

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

jest.mock('../errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn(() => ({
      code: 'ERROR',
      message: 'Test error',
      timestamp: new Date().toISOString(),
    })),
  },
}));

jest.mock('../logger', () => ({
  logApiRequest: jest.fn(),
  logPerformance: jest.fn(),
  logError: jest.fn(),
  Logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../monitoring', () => ({
  captureException: jest.fn(),
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
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS
      );

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should query with eq filter', async () => {
      const mockData = [{ id: '1' }];
      const mockEq = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: mockEq,
      });

      await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        {
          eq: { column: 'status', value: 'active' },
        }
      );

      expect(mockEq).toHaveBeenCalledWith('status', 'active');
    });

    it('should query with order', async () => {
      const mockData = [{ id: '1' }];
      const mockOrder = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: mockOrder,
      });

      await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        {
          order: { column: 'created_at', ascending: false },
        }
      );

      expect(mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should query with limit', async () => {
      const mockData = [{ id: '1' }];
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: mockLimit,
      });

      await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        { limit: 10 }
      );

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should handle query errors', async () => {
      const mockError = { message: 'Query failed' };
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      const result = await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(errorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should handle query exceptions', async () => {
      const mockError = new Error('Network error');
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError),
      });

      const result = await apiClient.query(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create item', async () => {
      const newItem = { name: 'Test' };
      const createdItem = { id: '1', ...newItem };
      const mockInsert = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: createdItem, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });

      const result = await apiClient.create(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        newItem
      );

      expect(mockInsert).toHaveBeenCalledWith([newItem]);
      expect(result.data).toEqual(createdItem);
      expect(result.error).toBeNull();
    });

    it('should handle create errors', async () => {
      const mockError = { message: 'Create failed' };
      const mockInsert = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: mockError });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });

      const result = await apiClient.create(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        { name: 'Test' }
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should handle create exceptions', async () => {
      const mockError = new Error('Network error');
      const mockInsert = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockRejectedValue(mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        insert: mockInsert,
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });

      const result = await apiClient.create(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        { name: 'Test' }
      );

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
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: updatedItem, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });

      const result = await apiClient.update(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        '1',
        updates
      );

      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(result.data).toEqual(updatedItem);
      expect(result.error).toBeNull();
    });

    it('should handle update errors', async () => {
      const mockError = { message: 'Update failed' };
      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: mockError });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });

      const result = await apiClient.update(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        '1',
        {
          name: 'Updated',
        }
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        '1'
      );

      expect(mockEq).toHaveBeenCalledWith('id', '1');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should handle delete errors', async () => {
      const mockError = { message: 'Delete failed' };
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: mockError });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        '1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle delete exceptions', async () => {
      const mockError = new Error('Network error');
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockRejectedValue(mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      });

      const result = await apiClient.delete(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        '1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
