import { SupabaseHelpers } from '../supabaseHelpers';
import type { MaintenanceTask, TaskFilters } from '@/types';

// Mock logger
const mockLogError = jest.fn();
jest.mock('../logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logApiRequest: jest.fn(),
}));

// Mock supabase client
const mockSupabaseClient = {
  from: jest.fn(),
};

// Mock getSupabase function
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(() => mockSupabaseClient),
}));

const mockMaintenanceTask: MaintenanceTask = {
  id: '1',
  instrument_id: 'inst-1',
  client_id: null,
  task_type: 'repair',
  title: 'Fix bridge',
  description: 'Fix the bridge of the violin',
  status: 'pending',
  received_date: '2024-01-01',
  due_date: '2024-01-15',
  personal_due_date: null,
  scheduled_date: null,
  completed_date: null,
  priority: 'high',
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  instrument: undefined,
};

// Helper to create a chainable mock that returns a Promise when awaited
function createChainableMockQuery(
  mockData: MaintenanceTask[] | null,
  mockError: unknown = null
) {
  // When error exists, data should be null (Supabase behavior)
  const data = mockError ? null : mockData;
  const mockPromise = Promise.resolve({ data, error: mockError });

  const chain = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnValue(mockPromise),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };

  // Make it thenable (Promise-like) so it can be awaited
  return Object.assign(mockPromise, chain);
}

describe('SupabaseHelpers - Maintenance Tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogError.mockClear();
  });

  describe('fetchMaintenanceTasks', () => {
    it('should fetch all maintenance tasks', async () => {
      const mockData = [mockMaintenanceTask];
      // For this test, order is called first and then we await the query
      const mockOrder = jest.fn().mockReturnThis();
      const mockQuery = createChainableMockQuery(mockData);
      mockQuery.order = mockOrder;

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTasks();

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('maintenance_tasks');
      expect(mockOrder).toHaveBeenCalledWith('received_date', {
        ascending: false,
      });
    });

    it('should fetch tasks with filters', async () => {
      const mockData = [mockMaintenanceTask];
      const filters: TaskFilters = {
        instrument_id: 'inst-1',
        status: 'pending',
        task_type: 'repair',
        priority: 'high',
      };

      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTasks(filters);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.eq).toHaveBeenCalledWith('instrument_id', 'inst-1');
      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'pending');
      expect(mockQuery.eq).toHaveBeenCalledWith('task_type', 'repair');
      expect(mockQuery.eq).toHaveBeenCalledWith('priority', 'high');
    });

    it('should fetch tasks with date filters', async () => {
      const mockData = [mockMaintenanceTask];
      const filters: TaskFilters = {
        date_from: '2024-01-01',
        date_to: '2024-01-31',
      };

      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTasks(filters);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.gte).toHaveBeenCalledWith('received_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('received_date', '2024-01-31');
    });

    it('should fetch tasks with search filter', async () => {
      const mockData = [mockMaintenanceTask];
      const filters: TaskFilters = {
        search: 'bridge',
      };

      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTasks(filters);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.or).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = createChainableMockQuery(null as any, mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTasks();

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('fetchMaintenanceTaskById', () => {
    it('should fetch a task by id', async () => {
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: mockMaintenanceTask,
            error: null,
          }),
        }),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTaskById('1');

      expect(result.data).toEqual(mockMaintenanceTask);
      expect(result.error).toBeNull();
    });

    it('should handle errors when fetching by id', async () => {
      const mockError = { message: 'Not found', code: 'PGRST116' };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: mockError,
          }),
        }),
      });

      const result = await SupabaseHelpers.fetchMaintenanceTaskById('1');

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('fetchTasksByDateRange', () => {
    it('should fetch tasks by date range', async () => {
      const mockData = [mockMaintenanceTask];
      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchTasksByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      expect(mockQuery.gte).toHaveBeenCalledWith('received_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('received_date', '2024-01-31');
      expect(result.data).toEqual(mockData);
    });

    it('should filter tasks by date range in client side', async () => {
      const task1: MaintenanceTask = {
        ...mockMaintenanceTask,
        id: '1',
        scheduled_date: '2024-01-15',
        received_date: '2024-01-10',
      };
      const task2: MaintenanceTask = {
        ...mockMaintenanceTask,
        id: '2',
        due_date: '2024-02-15',
        received_date: '2024-01-20',
      };
      const mockData = [task1, task2];

      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchTasksByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      // task1은 scheduled_date가 범위 내이므로 포함되어야 함
      // task2는 due_date가 범위 밖이지만 received_date가 범위 내이므로 포함되어야 함
      expect(result.data).toBeDefined();
      expect(result.data).toEqual(mockData);
    });

    it('should handle table not found error', async () => {
      const mockError = {
        code: '42P01',
        message: 'relation "maintenance_tasks" does not exist',
      };

      const mockQuery = createChainableMockQuery(null as any, mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchTasksByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      expect(result.error).toEqual(mockError);
      expect(mockLogError).toHaveBeenCalled();
    });

    it('should handle RLS policy error', async () => {
      const mockError = {
        code: 'PGRST116',
        message: 'permission denied',
      };

      const mockQuery = createChainableMockQuery(null as any, mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchTasksByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      expect(result.error).toEqual(mockError);
      expect(mockLogError).toHaveBeenCalled();
    });

    it('should handle unexpected errors', async () => {
      const mockError = new Error('Unexpected error');

      (mockSupabaseClient.from as jest.Mock).mockImplementation(() => {
        throw mockError;
      });

      const result = await SupabaseHelpers.fetchTasksByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('createMaintenanceTask', () => {
    it('should create a maintenance task', async () => {
      const newTask: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      > = {
        instrument_id: 'inst-1',
        client_id: null,
        task_type: 'repair',
        title: 'Fix bridge',
        description: 'Fix the bridge',
        status: 'pending',
        received_date: '2024-01-01',
        due_date: '2024-01-15',
        personal_due_date: null,
        scheduled_date: null,
        completed_date: null,
        priority: 'high',
        estimated_hours: null,
        actual_hours: null,
        cost: null,
        notes: null,
      };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMaintenanceTask,
          error: null,
        }),
      });

      const result = await SupabaseHelpers.createMaintenanceTask(newTask);

      expect(result.data).toEqual(mockMaintenanceTask);
      expect(result.error).toBeNull();
    });

    it('should handle errors when creating task', async () => {
      const newTask: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      > = {
        instrument_id: 'inst-1',
        client_id: null,
        task_type: 'repair',
        title: 'Fix bridge',
        description: null,
        status: 'pending',
        received_date: '2024-01-01',
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        completed_date: null,
        priority: 'medium',
        estimated_hours: null,
        actual_hours: null,
        cost: null,
        notes: null,
      };

      const mockError = { message: 'Validation error', code: '23502' };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await SupabaseHelpers.createMaintenanceTask(newTask);

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('updateMaintenanceTask', () => {
    it('should update a maintenance task', async () => {
      const updates = {
        status: 'in_progress' as const,
        notes: 'Started working on it',
      };

      const updatedTask = {
        ...mockMaintenanceTask,
        ...updates,
      };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: updatedTask,
          error: null,
        }),
      });

      const result = await SupabaseHelpers.updateMaintenanceTask('1', updates);

      expect(result.data).toEqual(updatedTask);
      expect(result.error).toBeNull();
    });

    it('should handle errors when updating task', async () => {
      const updates = {
        status: 'in_progress' as const,
      };

      const mockError = { message: 'Not found', code: 'PGRST116' };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await SupabaseHelpers.updateMaintenanceTask('1', updates);

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('deleteMaintenanceTask', () => {
    it('should delete a maintenance task', async () => {
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await SupabaseHelpers.deleteMaintenanceTask('1');

      expect(result.error).toBeNull();
    });

    it('should handle errors when deleting task', async () => {
      const mockError = { message: 'Not found', code: 'PGRST116' };

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: mockError,
        }),
      });

      const result = await SupabaseHelpers.deleteMaintenanceTask('1');

      expect(result.error).toEqual(mockError);
    });
  });

  describe('fetchTasksByScheduledDate', () => {
    it('should fetch tasks by scheduled date', async () => {
      const mockData = [mockMaintenanceTask];
      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result =
        await SupabaseHelpers.fetchTasksByScheduledDate('2024-01-01');

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.eq).toHaveBeenCalledWith('scheduled_date', '2024-01-01');
    });

    it('should handle errors when fetching by scheduled date', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = createChainableMockQuery(null as any, mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result =
        await SupabaseHelpers.fetchTasksByScheduledDate('2024-01-01');

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('fetchOverdueTasks', () => {
    it('should fetch overdue tasks', async () => {
      const mockData = [mockMaintenanceTask];
      const mockQuery = createChainableMockQuery(mockData);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchOverdueTasks();

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.in).toHaveBeenCalledWith('status', [
        'pending',
        'in_progress',
      ]);
      expect(mockQuery.or).toHaveBeenCalled();
    });

    it('should handle errors when fetching overdue tasks', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = createChainableMockQuery(null as any, mockError);

      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await SupabaseHelpers.fetchOverdueTasks();

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });
});
