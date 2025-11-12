// src/hooks/__tests__/useMaintenanceTasks.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMaintenanceTasks } from '../useMaintenanceTasks';
import { MaintenanceTask, TaskType, TaskStatus, TaskPriority } from '@/types';

// Mock useErrorHandler
jest.mock('../useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

// Mock SupabaseHelpers
jest.mock('@/utils/supabaseHelpers', () => ({
  SupabaseHelpers: {
    fetchMaintenanceTasks: jest.fn(),
    fetchMaintenanceTaskById: jest.fn(),
    createMaintenanceTask: jest.fn(),
    updateMaintenanceTask: jest.fn(),
    deleteMaintenanceTask: jest.fn(),
    fetchTasksByDateRange: jest.fn(),
    fetchTasksByScheduledDate: jest.fn(),
    fetchOverdueTasks: jest.fn(),
  },
}));

import { SupabaseHelpers } from '@/utils/supabaseHelpers';

describe('useMaintenanceTasks', () => {
  const mockTask: MaintenanceTask = {
    id: '1',
    instrument_id: 'instrument-1',
    client_id: null,
    task_type: 'repair' as TaskType,
    title: 'Violin Repair',
    description: 'Fix bridge',
    status: 'pending' as TaskStatus,
    received_date: '2024-01-01',
    due_date: '2024-01-15',
    personal_due_date: '2024-01-10',
    scheduled_date: '2024-01-05',
    completed_date: null,
    priority: 'medium' as TaskPriority,
    estimated_hours: 2,
    actual_hours: null,
    cost: 100,
    notes: 'Test notes',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty tasks and loading false', () => {
      const { result } = renderHook(() => useMaintenanceTasks());

      expect(result.current.tasks).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should initialize with initial filters', async () => {
      const initialFilters = {
        status: 'pending' as TaskStatus,
        task_type: 'repair' as TaskType,
      };

      (SupabaseHelpers.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [mockTask],
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks(initialFilters));

      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      expect(SupabaseHelpers.fetchMaintenanceTasks).toHaveBeenCalledWith(initialFilters);
    });
  });

  describe('fetchTasks', () => {
    it('should fetch tasks successfully', async () => {
      const mockTasks = [mockTask];
      (SupabaseHelpers.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(SupabaseHelpers.fetchMaintenanceTasks).toHaveBeenCalled();
    });

    it('should handle fetch tasks error', async () => {
      const fetchError = new Error('Fetch failed');
      (SupabaseHelpers.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe(fetchError);
      }, { timeout: 3000 });

      expect(result.current.tasks).toEqual([]);
    });

    it('should fetch tasks with filters', async () => {
      const filters = {
        status: 'pending' as TaskStatus,
        task_type: 'repair' as TaskType,
      };
      const mockTasks = [mockTask];
      (SupabaseHelpers.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      await act(async () => {
        await result.current.fetchTasks(filters);
      });

      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
      }, { timeout: 3000 });

      expect(SupabaseHelpers.fetchMaintenanceTasks).toHaveBeenCalledWith(filters);
    });
  });

  describe('fetchTaskById', () => {
    it('should fetch task by id successfully', async () => {
      (SupabaseHelpers.fetchMaintenanceTaskById as jest.Mock).mockResolvedValueOnce({
        data: mockTask,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTask: MaintenanceTask | null = null;
      await act(async () => {
        fetchedTask = await result.current.fetchTaskById('1');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTask).toEqual(mockTask);
      expect(SupabaseHelpers.fetchMaintenanceTaskById).toHaveBeenCalledWith('1');
    });

    it('should handle fetch task by id error', async () => {
      const fetchError = new Error('Fetch failed');
      (SupabaseHelpers.fetchMaintenanceTaskById as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTask: MaintenanceTask | null = null;
      await act(async () => {
        fetchedTask = await result.current.fetchTaskById('1');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTask).toBeNull();
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('createTask', () => {
    it('should create task successfully', async () => {
      const newTaskData = {
        instrument_id: 'instrument-1',
        client_id: null,
        task_type: 'repair' as TaskType,
        title: 'New Repair',
        description: 'New repair task',
        status: 'pending' as TaskStatus,
        received_date: '2024-01-01',
        due_date: '2024-01-15',
        personal_due_date: '2024-01-10',
        scheduled_date: '2024-01-05',
        completed_date: null,
        priority: 'medium' as TaskPriority,
        estimated_hours: 2,
        actual_hours: null,
        cost: 100,
        notes: 'New notes',
      };

      const createdTask: MaintenanceTask = {
        ...newTaskData,
        id: '2',
        completed_date: null,
        actual_hours: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: createdTask,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let createdTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        createdTaskResult = await result.current.createTask(newTaskData);
      });

      // Wait for state update
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      // Check that task was added to the list
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
        expect(result.current.tasks[0].id).toBe(createdTask.id);
      }, { timeout: 3000 });

      expect(createdTaskResult).toEqual(createdTask);
      expect(SupabaseHelpers.createMaintenanceTask).toHaveBeenCalledWith(newTaskData);
    });

    it('should handle create task error', async () => {
      const newTaskData = {
        instrument_id: 'instrument-1',
        client_id: null,
        task_type: 'repair' as TaskType,
        title: 'New Repair',
        description: 'New repair task',
        status: 'pending' as TaskStatus,
        received_date: '2024-01-01',
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        completed_date: null,
        priority: 'medium' as TaskPriority,
        estimated_hours: null,
        actual_hours: null,
        cost: null,
        notes: null,
      };

      const createError = new Error('Create failed');
      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: createError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let createdTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        createdTaskResult = await result.current.createTask(newTaskData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(createdTaskResult).toBeNull();
      expect(result.current.error).toBe(createError);
      expect(result.current.tasks).toEqual([]);
    });
  });

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      const updatedTask: MaintenanceTask = {
        ...mockTask,
        title: 'Updated Repair',
        status: 'in_progress' as TaskStatus,
      };

      (SupabaseHelpers.updateMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: updatedTask,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      // First, manually set up tasks by creating one
      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: mockTask,
        error: null,
      });

      await act(async () => {
        await result.current.createTask({
          instrument_id: mockTask.instrument_id,
          client_id: mockTask.client_id,
          task_type: mockTask.task_type,
          title: mockTask.title,
          description: mockTask.description,
          status: mockTask.status,
          received_date: mockTask.received_date,
          due_date: mockTask.due_date,
          personal_due_date: mockTask.personal_due_date,
          scheduled_date: mockTask.scheduled_date,
          completed_date: mockTask.completed_date,
          priority: mockTask.priority,
          estimated_hours: mockTask.estimated_hours,
          actual_hours: mockTask.actual_hours,
          cost: mockTask.cost,
          notes: mockTask.notes,
        });
      });

      // Wait for task to be created
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      let updatedTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        updatedTaskResult = await result.current.updateTask('1', {
          title: 'Updated Repair',
          status: 'in_progress' as TaskStatus,
        });
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      // Check that task was updated in the list
      await waitFor(() => {
        const task = result.current.tasks.find(t => t.id === '1');
        expect(task).toBeDefined();
        if (task) {
          expect(task.title).toBe('Updated Repair');
          expect(task.status).toBe('in_progress');
        }
      }, { timeout: 3000 });

      expect(updatedTaskResult).toEqual(updatedTask);
      expect(SupabaseHelpers.updateMaintenanceTask).toHaveBeenCalledWith('1', {
        title: 'Updated Repair',
        status: 'in_progress',
      });
    });

    it('should handle update task error', async () => {
      const updateError = new Error('Update failed');
      (SupabaseHelpers.updateMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: updateError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      // First, manually set up tasks by creating one
      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: mockTask,
        error: null,
      });

      await act(async () => {
        await result.current.createTask({
          instrument_id: mockTask.instrument_id,
          client_id: mockTask.client_id,
          task_type: mockTask.task_type,
          title: mockTask.title,
          description: mockTask.description,
          status: mockTask.status,
          received_date: mockTask.received_date,
          due_date: mockTask.due_date,
          personal_due_date: mockTask.personal_due_date,
          scheduled_date: mockTask.scheduled_date,
          completed_date: mockTask.completed_date,
          priority: mockTask.priority,
          estimated_hours: mockTask.estimated_hours,
          actual_hours: mockTask.actual_hours,
          cost: mockTask.cost,
          notes: mockTask.notes,
        });
      });

      // Wait for task to be created
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      let updatedTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        updatedTaskResult = await result.current.updateTask('1', {
          title: 'Updated Repair',
        });
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(updatedTaskResult).toBeNull();
      expect(result.current.error).toBe(updateError);
      // Task should not be updated
      await waitFor(() => {
        const task = result.current.tasks.find(t => t.id === '1');
        expect(task).toBeDefined();
        expect(task?.title).toBe('Violin Repair');
      }, { timeout: 3000 });
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      (SupabaseHelpers.deleteMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      // First, manually set up tasks by creating one
      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: mockTask,
        error: null,
      });

      await act(async () => {
        await result.current.createTask({
          instrument_id: mockTask.instrument_id,
          client_id: mockTask.client_id,
          task_type: mockTask.task_type,
          title: mockTask.title,
          description: mockTask.description,
          status: mockTask.status,
          received_date: mockTask.received_date,
          due_date: mockTask.due_date,
          personal_due_date: mockTask.personal_due_date,
          scheduled_date: mockTask.scheduled_date,
          completed_date: mockTask.completed_date,
          priority: mockTask.priority,
          estimated_hours: mockTask.estimated_hours,
          actual_hours: mockTask.actual_hours,
          cost: mockTask.cost,
          notes: mockTask.notes,
        });
      });

      // Wait for task to be created
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Now delete the task
      await act(async () => {
        await result.current.deleteTask('1');
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      // Check that task was removed from the list
      await waitFor(() => {
        const task = result.current.tasks.find(t => t.id === '1');
        expect(task).toBeUndefined();
      }, { timeout: 3000 });

      expect(SupabaseHelpers.deleteMaintenanceTask).toHaveBeenCalledWith('1');
    });

    it('should handle delete task error', async () => {
      const deleteError = new Error('Delete failed');
      (SupabaseHelpers.deleteMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        error: deleteError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      // First, manually set up tasks by creating one
      (SupabaseHelpers.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: mockTask,
        error: null,
      });

      await act(async () => {
        await result.current.createTask({
          instrument_id: mockTask.instrument_id,
          client_id: mockTask.client_id,
          task_type: mockTask.task_type,
          title: mockTask.title,
          description: mockTask.description,
          status: mockTask.status,
          received_date: mockTask.received_date,
          due_date: mockTask.due_date,
          personal_due_date: mockTask.personal_due_date,
          scheduled_date: mockTask.scheduled_date,
          completed_date: mockTask.completed_date,
          priority: mockTask.priority,
          estimated_hours: mockTask.estimated_hours,
          actual_hours: mockTask.actual_hours,
          cost: mockTask.cost,
          notes: mockTask.notes,
        });
      });

      // Wait for task to be created
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Now try to delete the task (should fail)
      await act(async () => {
        await result.current.deleteTask('1');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.error).toBe(deleteError);
      // Task should not be deleted
      await waitFor(() => {
        expect(result.current.tasks.length).toBeGreaterThan(0);
        const task = result.current.tasks.find(t => t.id === '1');
        expect(task).toBeDefined();
      }, { timeout: 3000 });
    });
  });

  describe('fetchTasksByDateRange', () => {
    it('should fetch tasks by date range successfully', async () => {
      const mockTasks = [mockTask];
      (SupabaseHelpers.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31');
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      // Check that tasks were fetched
      expect(fetchedTasks).toEqual(mockTasks);
      expect(SupabaseHelpers.fetchTasksByDateRange).toHaveBeenCalledWith('2024-01-01', '2024-01-31');
      
      // Note: fetchTasksByDateRange merges tasks into the existing tasks array
      // Since we start with an empty array, the tasks should be added
      await waitFor(() => {
        // Tasks should be merged into the state
        expect(result.current.tasks.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('should handle fetch tasks by date range error', async () => {
      const fetchError = new Error('Fetch failed');
      (SupabaseHelpers.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('fetchTasksByScheduledDate', () => {
    it('should fetch tasks by scheduled date successfully', async () => {
      const mockTasks = [mockTask];
      (SupabaseHelpers.fetchTasksByScheduledDate as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByScheduledDate('2024-01-05');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTasks).toEqual(mockTasks);
      expect(SupabaseHelpers.fetchTasksByScheduledDate).toHaveBeenCalledWith('2024-01-05');
    });

    it('should handle fetch tasks by scheduled date error', async () => {
      const fetchError = new Error('Fetch failed');
      (SupabaseHelpers.fetchTasksByScheduledDate as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByScheduledDate('2024-01-05');
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('fetchOverdueTasks', () => {
    it('should fetch overdue tasks successfully', async () => {
      const mockTasks = [mockTask];
      (SupabaseHelpers.fetchOverdueTasks as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchOverdueTasks();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTasks).toEqual(mockTasks);
      expect(SupabaseHelpers.fetchOverdueTasks).toHaveBeenCalled();
    });

    it('should handle fetch overdue tasks error', async () => {
      const fetchError = new Error('Fetch failed');
      (SupabaseHelpers.fetchOverdueTasks as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() => useMaintenanceTasks());

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchOverdueTasks();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('Loading state', () => {
    it('should set loading state correctly during fetch', async () => {
      let resolveFetch: ((value: { data: MaintenanceTask[]; error: null }) => void) | null = null;
      const fetchPromise = new Promise<{ data: MaintenanceTask[]; error: null }>(resolve => {
        resolveFetch = resolve;
      });

      (SupabaseHelpers.fetchMaintenanceTasks as jest.Mock).mockImplementation(
        () => fetchPromise
      );

      const { result } = renderHook(() => useMaintenanceTasks());

      // Start fetch
      act(() => {
        result.current.fetchTasks();
      });

      // Wait for loading to be true
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      }, { timeout: 1000 });

      // Resolve the promise
      await act(async () => {
        if (resolveFetch) {
          resolveFetch({ data: [], error: null });
        }
      });

      // Wait for loading to be false
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });
    });
  });
});

