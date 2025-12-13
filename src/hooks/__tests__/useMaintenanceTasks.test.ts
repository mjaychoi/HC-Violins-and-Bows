// src/hooks/__tests__/useMaintenanceTasks.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMaintenanceTasks } from '../useMaintenanceTasks';
import { MaintenanceTask, TaskType, TaskStatus, TaskPriority } from '@/types';
import { dataService } from '@/services/dataService';

// Mock useErrorHandler
jest.mock('../useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

// Mock apiClient to prevent actual Supabase calls
jest.mock('@/utils/apiClient', () => ({
  apiClient: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock dataService
jest.mock('@/services/dataService', () => ({
  dataService: {
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
    // Reset all mocks - each test should set up its own mocks
    // Set default mock that returns empty to prevent undefined errors
    // Individual tests will override with mockResolvedValueOnce
    (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  describe('Initialization', () => {
    it('should initialize with empty tasks and loading false', async () => {
      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // Wait for initial render to complete
      await waitFor(() => {
        expect(result.current.loading.fetch).toBe(false);
        expect(result.current.loading.mutate).toBe(false);
      });

      expect(result.current.tasks).toEqual([]);
      expect(result.current.error).toBe(null);
    });

    it('should initialize with initial filters', async () => {
      const initialFilters = {
        status: 'pending' as TaskStatus,
        task_type: 'repair' as TaskType,
      };

      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [mockTask],
        error: null,
      });

      const { result } = renderHook(() => useMaintenanceTasks(initialFilters));

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      expect(dataService.fetchMaintenanceTasks).toHaveBeenCalledWith(
        initialFilters
      );
    });
  });

  describe('fetchTasks', () => {
    it('should fetch tasks successfully', async () => {
      const mockTasks = [mockTask];
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValue({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.tasks).toEqual(mockTasks);
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(dataService.fetchMaintenanceTasks).toHaveBeenCalled();
    });

    it('should handle fetch tasks error', async () => {
      const fetchError = new Error('Fetch failed');
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValue({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
          expect(result.current.error).toBe(fetchError);
        },
        { timeout: 3000 }
      );

      expect(result.current.tasks).toEqual([]);
    });

    it('should fetch tasks with filters', async () => {
      const filters = {
        status: 'pending' as TaskStatus,
        task_type: 'repair' as TaskType,
      };
      const mockTasks = [mockTask];

      // Clear and reset mock
      (dataService.fetchMaintenanceTasks as jest.Mock).mockClear();
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks(filters);
      });

      await waitFor(
        () => {
          expect(result.current.tasks).toEqual(mockTasks);
        },
        { timeout: 3000 }
      );

      expect(dataService.fetchMaintenanceTasks).toHaveBeenCalledWith(filters);
    });
  });

  describe('fetchTaskById', () => {
    it('should fetch task by id successfully', async () => {
      (dataService.fetchMaintenanceTaskById as jest.Mock).mockResolvedValueOnce(
        {
          data: mockTask,
          error: null,
        }
      );

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTask: MaintenanceTask | null = null;
      await act(async () => {
        fetchedTask = await result.current.fetchTaskById('1');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTask).toEqual(mockTask);
      expect(dataService.fetchMaintenanceTaskById).toHaveBeenCalledWith('1');
    });

    it('should handle fetch task by id error', async () => {
      const fetchError = new Error('Fetch failed');
      (dataService.fetchMaintenanceTaskById as jest.Mock).mockResolvedValueOnce(
        {
          data: null,
          error: fetchError,
        }
      );

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTask: MaintenanceTask | null = null;
      await act(async () => {
        fetchedTask = await result.current.fetchTaskById('1');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

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

      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: createdTask,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let createdTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        createdTaskResult = await result.current.createTask(newTaskData);
      });

      // Wait for state update
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Check that task was added to the list
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
          expect(result.current.tasks[0].id).toBe(createdTask.id);
        },
        { timeout: 3000 }
      );

      expect(createdTaskResult).toEqual(createdTask);
      expect(dataService.createMaintenanceTask).toHaveBeenCalledWith(
        newTaskData
      );
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
      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValue({
        data: null,
        error: createError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let createdTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        createdTaskResult = await result.current.createTask(newTaskData);
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
          expect(result.current.error).toBe(createError);
        },
        { timeout: 3000 }
      );

      expect(createdTaskResult).toBeNull();
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

      (dataService.updateMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: updatedTask,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
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
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      let updatedTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        updatedTaskResult = await result.current.updateTask('1', {
          title: 'Updated Repair',
          status: 'in_progress' as TaskStatus,
        });
      });

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Check that task was updated in the list
      await waitFor(
        () => {
          const task = result.current.tasks.find(
            (t: MaintenanceTask) => t.id === '1'
          );
          expect(task).toBeDefined();
          if (task) {
            expect(task.title).toBe('Updated Repair');
            expect(task.status).toBe('in_progress');
          }
        },
        { timeout: 3000 }
      );

      expect(updatedTaskResult).toEqual(updatedTask);
      expect(dataService.updateMaintenanceTask).toHaveBeenCalledWith('1', {
        title: 'Updated Repair',
        status: 'in_progress',
      });
    });

    it('should handle update task error', async () => {
      const updateError = new Error('Update failed');
      (dataService.updateMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: updateError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
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
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      let updatedTaskResult: MaintenanceTask | null = null;
      await act(async () => {
        updatedTaskResult = await result.current.updateTask('1', {
          title: 'Updated Repair',
        });
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(updatedTaskResult).toBeNull();
      expect(result.current.error).toBe(updateError);
      // Task should not be updated
      await waitFor(
        () => {
          const task = result.current.tasks.find(
            (t: MaintenanceTask) => t.id === '1'
          );
          expect(task).toBeDefined();
          expect(task?.title).toBe('Violin Repair');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      (dataService.deleteMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
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
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Now delete the task
      await act(async () => {
        await result.current.deleteTask('1');
      });

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Check that task was removed from the list
      await waitFor(
        () => {
          const task = result.current.tasks.find(
            (t: MaintenanceTask) => t.id === '1'
          );
          expect(task).toBeUndefined();
        },
        { timeout: 3000 }
      );

      expect(dataService.deleteMaintenanceTask).toHaveBeenCalledWith('1');
    });

    it('should handle delete task error', async () => {
      const deleteError = new Error('Delete failed');
      (dataService.deleteMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        error: deleteError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
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
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Now try to delete the task (should fail)
      await act(async () => {
        await result.current.deleteTask('1');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(result.current.error).toBe(deleteError);
      // Task should not be deleted
      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
          const task = result.current.tasks.find(
            (t: MaintenanceTask) => t.id === '1'
          );
          expect(task).toBeDefined();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('fetchTasksByDateRange', () => {
    it('should fetch tasks by date range successfully', async () => {
      const mockTasks = [mockTask];
      (dataService.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange(
          '2024-01-01',
          '2024-01-31'
        );
      });

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Check that tasks were fetched
      expect(fetchedTasks).toEqual(mockTasks);
      expect(dataService.fetchTasksByDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31'
      );

      // Note: fetchTasksByDateRange merges tasks into the existing tasks array
      // Since we start with an empty array, the tasks should be added
      await waitFor(
        () => {
          // Tasks should be merged into the state
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('should handle fetch tasks by date range error', async () => {
      const fetchError = new Error('Fetch failed');
      (dataService.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange(
          '2024-01-01',
          '2024-01-31'
        );
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('fetchTasksByScheduledDate', () => {
    it('should fetch tasks by scheduled date successfully', async () => {
      const mockTasks = [mockTask];
      (
        dataService.fetchTasksByScheduledDate as jest.Mock
      ).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks =
          await result.current.fetchTasksByScheduledDate('2024-01-05');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual(mockTasks);
      expect(dataService.fetchTasksByScheduledDate).toHaveBeenCalledWith(
        '2024-01-05'
      );
    });

    it('should handle fetch tasks by scheduled date error', async () => {
      const fetchError = new Error('Fetch failed');
      (
        dataService.fetchTasksByScheduledDate as jest.Mock
      ).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks =
          await result.current.fetchTasksByScheduledDate('2024-01-05');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('fetchOverdueTasks', () => {
    it('should fetch overdue tasks successfully', async () => {
      const mockTasks = [mockTask];
      (dataService.fetchOverdueTasks as jest.Mock).mockResolvedValueOnce({
        data: mockTasks,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchOverdueTasks();
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual(mockTasks);
      expect(dataService.fetchOverdueTasks).toHaveBeenCalled();
    });

    it('should handle fetch overdue tasks error', async () => {
      const fetchError = new Error('Fetch failed');
      (dataService.fetchOverdueTasks as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: fetchError,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchOverdueTasks();
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual([]);
      expect(result.current.error).toBe(fetchError);
    });
  });

  describe('Loading state', () => {
    it('should set loading state correctly during fetch', async () => {
      let resolveFetch:
        | ((value: { data: MaintenanceTask[]; error: null }) => void)
        | null = null;
      const fetchPromise = new Promise<{
        data: MaintenanceTask[];
        error: null;
      }>(resolve => {
        resolveFetch = resolve;
      });

      (dataService.fetchMaintenanceTasks as jest.Mock).mockImplementation(
        () => fetchPromise
      );

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // Start fetch
      act(() => {
        result.current.fetchTasks();
      });

      // Wait for loading to be true
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(true);
        },
        { timeout: 1000 }
      );

      // Resolve the promise
      await act(async () => {
        if (resolveFetch) {
          resolveFetch({ data: [], error: null });
        }
      });

      // Wait for loading to be false
      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('fetchTasksByDateRange - duplicate handling', () => {
    it('should merge tasks without duplicates', async () => {
      const existingTask: MaintenanceTask = {
        ...mockTask,
        id: 'existing-1',
      };
      const newTask: MaintenanceTask = {
        ...mockTask,
        id: 'new-1',
        title: 'New Task',
      };
      const duplicateTask: MaintenanceTask = {
        ...mockTask,
        id: 'existing-1', // Same ID as existing
        title: 'Updated Title',
      };

      // Clear and reset mock
      (dataService.fetchMaintenanceTasks as jest.Mock).mockClear();
      // First, set up some existing tasks
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [existingTask],
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBe(1);
          expect(result.current.tasks[0].id).toBe('existing-1');
        },
        { timeout: 3000 }
      );

      // Now fetch by date range with new and duplicate tasks
      (dataService.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: [newTask, duplicateTask],
        error: null,
      });

      await act(async () => {
        await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Should have 2 tasks: existing (not replaced by duplicate) and new
      // Note: The implementation merges new tasks, so duplicateTask should be added
      // But if the logic prevents duplicates, existing should remain
      await waitFor(
        () => {
          const taskIds = result.current.tasks.map(t => t.id);
          expect(taskIds).toContain('existing-1');
          expect(taskIds).toContain('new-1');
          // Should not have duplicate
          expect(taskIds.filter(id => id === 'existing-1').length).toBe(1);
        },
        { timeout: 3000 }
      );
    });

    it('should handle empty date range results', async () => {
      (dataService.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange(
          '2024-01-01',
          '2024-01-31'
        );
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(fetchedTasks).toEqual([]);
      expect(result.current.tasks).toEqual([]);
    });
  });

  describe('fetchTasksByScheduledDate - duplicate handling', () => {
    it('should merge tasks without duplicates', async () => {
      const existingTask: MaintenanceTask = {
        ...mockTask,
        id: 'existing-1',
      };
      const newTask: MaintenanceTask = {
        ...mockTask,
        id: 'new-1',
        title: 'New Scheduled Task',
      };

      // Clear and reset mock
      (dataService.fetchMaintenanceTasks as jest.Mock).mockClear();
      // First, set up some existing tasks
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [existingTask],
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBe(1);
          expect(result.current.tasks[0].id).toBe('existing-1');
        },
        { timeout: 3000 }
      );

      // Now fetch by scheduled date with new task
      (
        dataService.fetchTasksByScheduledDate as jest.Mock
      ).mockResolvedValueOnce({
        data: [newTask],
        error: null,
      });

      await act(async () => {
        await result.current.fetchTasksByScheduledDate('2024-01-05');
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Should have both tasks
      await waitFor(
        () => {
          const taskIds = result.current.tasks.map(t => t.id);
          expect(taskIds).toContain('existing-1');
          expect(taskIds).toContain('new-1');
          expect(result.current.tasks.length).toBe(2);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Multiple operations', () => {
    it('should handle concurrent fetch operations', async () => {
      const task1: MaintenanceTask = { ...mockTask, id: '1' };
      const task2: MaintenanceTask = { ...mockTask, id: '2', title: 'Task 2' };

      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [task1],
        error: null,
      });

      (dataService.fetchTasksByDateRange as jest.Mock).mockResolvedValueOnce({
        data: [task2],
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // Start both operations
      await act(async () => {
        await Promise.all([
          result.current.fetchTasks(),
          result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31'),
        ]);
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Should have tasks from both operations
      await waitFor(
        () => {
          const taskIds = result.current.tasks.map(t => t.id);
          expect(taskIds.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('should update tasks correctly after multiple operations', async () => {
      const initialTask: MaintenanceTask = {
        ...mockTask,
        id: '1',
        title: 'Initial',
      };

      (dataService.createMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: initialTask,
        error: null,
      });

      const updatedTask: MaintenanceTask = {
        ...initialTask,
        title: 'Updated',
        status: 'in_progress' as TaskStatus,
      };

      (dataService.updateMaintenanceTask as jest.Mock).mockResolvedValueOnce({
        data: updatedTask,
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // Create task
      await act(async () => {
        await result.current.createTask({
          instrument_id: initialTask.instrument_id,
          client_id: initialTask.client_id,
          task_type: initialTask.task_type,
          title: initialTask.title,
          description: initialTask.description,
          status: initialTask.status,
          received_date: initialTask.received_date,
          due_date: initialTask.due_date,
          personal_due_date: initialTask.personal_due_date,
          scheduled_date: initialTask.scheduled_date,
          completed_date: initialTask.completed_date,
          priority: initialTask.priority,
          estimated_hours: initialTask.estimated_hours,
          actual_hours: initialTask.actual_hours,
          cost: initialTask.cost,
          notes: initialTask.notes,
        });
      });

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBe(1);
          expect(result.current.tasks[0].title).toBe('Initial');
        },
        { timeout: 3000 }
      );

      // Update task
      await act(async () => {
        await result.current.updateTask('1', {
          title: 'Updated',
          status: 'in_progress' as TaskStatus,
        });
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
          const task = result.current.tasks.find(t => t.id === '1');
          expect(task?.title).toBe('Updated');
          expect(task?.status).toBe('in_progress');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Initial filters', () => {
    it('should fetch tasks on mount when initialFilters provided', async () => {
      const filters = {
        status: 'pending' as TaskStatus,
      };

      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [mockTask],
        error: null,
      });

      renderHook(() => useMaintenanceTasks(filters));

      await waitFor(
        () => {
          expect(dataService.fetchMaintenanceTasks).toHaveBeenCalledWith(
            filters
          );
        },
        { timeout: 3000 }
      );
    });

    it('should not fetch tasks on mount when no initialFilters and autoFetch is false', async () => {
      // Reset mock completely before this test
      (dataService.fetchMaintenanceTasks as jest.Mock).mockReset();
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      renderHook(() => useMaintenanceTasks({ autoFetch: false }));

      // Wait for initial render and useEffect to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not call fetchMaintenanceTasks when autoFetch is false
      // Note: mockClear was called, so we check that no calls were made
      expect(dataService.fetchMaintenanceTasks).not.toHaveBeenCalled();
    });
  });

  describe('Error state reset', () => {
    it('should reset error state on successful operation after error', async () => {
      const error = new Error('Initial error');
      let callCount = 0;
      (dataService.fetchMaintenanceTasks as jest.Mock).mockImplementation(
        () => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ data: null, error });
          }
          return Promise.resolve({ data: [mockTask], error: null });
        }
      );

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe(error);
        },
        { timeout: 3000 }
      );

      // Now succeed
      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe(null);
          expect(result.current.tasks).toEqual([mockTask]);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('fetchOverdueTasks - state management', () => {
    it('should not modify tasks state when fetching overdue tasks', async () => {
      const existingTask: MaintenanceTask = {
        ...mockTask,
        id: 'existing-1',
      };
      const overdueTask: MaintenanceTask = {
        ...mockTask,
        id: 'overdue-1',
        title: 'Overdue Task',
      };

      // Clear and reset mock
      (dataService.fetchMaintenanceTasks as jest.Mock).mockClear();
      // Set up existing tasks
      (dataService.fetchMaintenanceTasks as jest.Mock).mockResolvedValueOnce({
        data: [existingTask],
        error: null,
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBe(1);
          expect(result.current.tasks[0].id).toBe('existing-1');
        },
        { timeout: 3000 }
      );

      // Fetch overdue tasks - this should NOT modify tasks state
      (dataService.fetchOverdueTasks as jest.Mock).mockResolvedValueOnce({
        data: [overdueTask],
        error: null,
      });

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchOverdueTasks();
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      // Should return overdue tasks but not modify state
      expect(fetchedTasks).toEqual([overdueTask]);
      // State should remain unchanged (only existing task)
      // fetchOverdueTasks does NOT merge tasks into state
      expect(result.current.tasks.length).toBe(1);
      expect(result.current.tasks[0].id).toBe('existing-1');
    });
  });
});
