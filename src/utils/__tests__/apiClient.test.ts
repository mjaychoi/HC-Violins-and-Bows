import { ApiClient, TableName } from '../apiClient';
import { errorHandler } from '../errorHandler';
import { withNormalizedDefaults } from '@/test/fixtures/rows';

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
  getSupabaseClient: jest.fn(() => mockSupabaseClient),
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

const createInstrumentRow = (overrides: Record<string, unknown> = {}) =>
  withNormalizedDefaults({
    status: 'Available',
    maker: 'Mock Maker',
    type: 'Violin',
    subtype: null,
    serial_number: null,
    price: null,
    ownership: null,
    note: null,
    size: null,
    weight: null,
    year: null,
    certificate: false,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

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
      const mockData = [
        createInstrumentRow({ id: '1' }),
        createInstrumentRow({ id: '2' }),
      ];
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await apiClient.query('instruments' as TableName);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should query with eq filter', async () => {
      const mockData = [createInstrumentRow({ id: '1' })];
      const mockEq = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: mockEq,
      });

      await apiClient.query('instruments' as TableName, {
        eq: { column: 'status', value: 'active' },
      });

      expect(mockEq).toHaveBeenCalledWith('status', 'active');
    });

    it('should query with order', async () => {
      const mockData = [createInstrumentRow({ id: '1' })];
      const mockOrder = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: mockOrder,
      });

      await apiClient.query('instruments' as TableName, {
        order: { column: 'created_at', ascending: false },
      });

      expect(mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should query with limit', async () => {
      const mockData = [createInstrumentRow({ id: '1' })];
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: mockLimit,
      });

      await apiClient.query('instruments' as TableName, { limit: 10 });

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should handle query errors', async () => {
      const mockError = { message: 'Query failed' };
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      const result = await apiClient.query('instruments' as TableName);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(errorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should handle query exceptions', async () => {
      const mockError = new Error('Network error');
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError),
      });

      const result = await apiClient.query('instruments' as TableName);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('create', () => {
    const newItem = createInstrumentRow({
      id: undefined,
      maker: null,
      type: null,
      subtype: null,
      year: null,
      certificate: false,
      size: null,
      weight: null,
      price: null,
      ownership: null,
      note: null,
      serial_number: null,
      created_at: null,
      cost_price: null,
      consignment_price: null,
    });

    it('should create item', async () => {
      const createdItem = createInstrumentRow({
        id: '1',
        ...newItem,
      });
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
        'instruments' as TableName,
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
        'instruments' as TableName,
        newItem
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
        'instruments' as TableName,
        newItem
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update item', async () => {
      const updates = { status: 'Booked' };
      const updatedItem = createInstrumentRow({ id: '1', ...updates });
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
        'instruments' as TableName,
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

      const result = await apiClient.update('instruments' as TableName, '1', {
        status: 'Sold',
      });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: { id: '1' }, error: null });
      const mockEq = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });
      const mockDelete = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      const result = await apiClient.delete('instruments' as TableName, '1');

      expect(mockEq).toHaveBeenCalledWith('id', '1');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should handle delete errors', async () => {
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'Delete failed' } });
      const mockEq = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: mockSingle,
      });
      const mockDelete = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      const result = await apiClient.delete('instruments' as TableName, '1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle delete exceptions', async () => {
      const mockError = new Error('Network error');
      const mockEq = jest.fn().mockReturnValue({
        select: jest.fn().mockImplementation(() => {
          throw mockError;
        }),
        single: jest.fn(),
      });
      const mockDelete = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      const result = await apiClient.delete('instruments' as TableName, '1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
