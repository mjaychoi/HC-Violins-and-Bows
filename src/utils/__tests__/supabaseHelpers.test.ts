import { SupabaseHelpers } from '../supabaseHelpers';
import { ALLOWED_SORT_COLUMNS } from '../inputValidation';

// Mock supabase client
// Create chainable mock functions that return 'this' for method chaining
const createChainableMock = () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
  };
  return chain;
};

const mockSupabaseClient = {
  from: jest.fn(() => createChainableMock()),
};

// Mock getSupabaseClient function (async)
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

describe('SupabaseHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAll', () => {
    it('should fetch all items', async () => {
      const mockData = [{ id: '1' }, { id: '2' }];
      const mockSelect = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.fetchAll(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS
      );

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should fetch with orderBy', async () => {
      const mockData = [{ id: '1' }];
      const mockOrder = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest.fn().mockReturnThis();

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;
      chainableMock.order = mockOrder;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      await SupabaseHelpers.fetchAll(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        {
          orderBy: { column: 'created_at', ascending: false },
        }
      );

      expect(mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should fetch with limit', async () => {
      const mockData = [{ id: '1' }];
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest.fn().mockReturnThis();

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;
      chainableMock.limit = mockLimit;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      await SupabaseHelpers.fetchAll(
        'instruments' as keyof typeof ALLOWED_SORT_COLUMNS,
        { limit: 10 }
      );

      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('fetchById', () => {
    it('should fetch item by id', async () => {
      const mockData = { id: '1', name: 'Test' };
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest
        .fn()
        .mockReturnValue({ eq: mockEq, single: mockSingle });

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.fetchById('test_table', '1');

      expect(result.data).toEqual(mockData);
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

      const chainableMock = createChainableMock();
      chainableMock.insert = mockInsert;
      chainableMock.select = mockSelect;
      chainableMock.single = mockSingle;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.create('test_table', newItem);

      expect(mockInsert).toHaveBeenCalledWith([newItem]);
      expect(result.data).toEqual(createdItem);
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

      const chainableMock = createChainableMock();
      chainableMock.update = mockUpdate;
      chainableMock.eq = mockEq;
      chainableMock.select = mockSelect;
      chainableMock.single = mockSingle;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.update('test_table', '1', updates);

      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(result.data).toEqual(updatedItem);
    });
  });

  describe('delete', () => {
    it('should delete item', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });

      const chainableMock = createChainableMock();
      chainableMock.delete = mockDelete;
      chainableMock.eq = mockEq;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.delete('test_table', '1');

      expect(mockEq).toHaveBeenCalledWith('id', '1');
      expect(result.error).toBeNull();
    });
  });

  describe('search', () => {
    it('should search items', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      const mockOr = jest.fn().mockReturnThis();
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest
        .fn()
        .mockReturnValue({ or: mockOr, limit: mockLimit });

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      const result = await SupabaseHelpers.search('test_table', 'test', [
        'name',
        'description',
      ]);

      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(result.data).toEqual(mockData);
    });

    it('should escape special characters', async () => {
      const mockData: unknown[] = [];
      const mockOr = jest.fn().mockReturnThis();
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest
        .fn()
        .mockReturnValue({ or: mockOr, limit: mockLimit });

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      await SupabaseHelpers.search('test_table', 'test%_value', ['name']);

      expect(mockOr).toHaveBeenCalled();
    });

    it('should use custom limit', async () => {
      const mockData: unknown[] = [];
      const mockOr = jest.fn().mockReturnThis();
      const mockLimit = jest
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest
        .fn()
        .mockReturnValue({ or: mockOr, limit: mockLimit });

      const chainableMock = createChainableMock();
      chainableMock.select = mockSelect;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue(chainableMock);

      await SupabaseHelpers.search('test_table', 'test', ['name'], {
        limit: 20,
      });

      expect(mockLimit).toHaveBeenCalledWith(20);
    });
  });
});
