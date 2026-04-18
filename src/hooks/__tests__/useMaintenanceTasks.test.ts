// src/hooks/__tests__/useMaintenanceTasks.test.ts
import { renderHook, act, waitFor } from '@/test-utils/render';
import {
  __resetMaintenanceTasksReadCacheForTests,
  useMaintenanceTasks,
} from '../useMaintenanceTasks';
import { MaintenanceTask, TaskType, TaskStatus, TaskPriority } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { ApiResponseError } from '@/utils/handleApiResponse';

const mockHandleError = jest.fn();

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

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
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
    __resetMaintenanceTasksReadCacheForTests();
    mockHandleError.mockClear();
    // Default: all apiFetch calls return empty success to prevent undefined errors.
    // Individual tests override with mockResolvedValueOnce.
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: [] }),
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

      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [mockTask] }),
      });

      const { result } = renderHook(() => useMaintenanceTasks(initialFilters));

      await waitFor(
        () => {
          expect(result.current.tasks.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      );
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('task_type=repair')
      );
    });
  });

  describe('fetchTasks', () => {
    it('should fetch tasks successfully', async () => {
      const mockTasks = [mockTask];
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTasks }),
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

      expect(apiFetch).toHaveBeenCalledWith('/api/maintenance-tasks');
    });

    it('should handle fetch tasks error', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({
          message: 'Fetch failed',
          error_code: 'TASK_FETCH_FAILED',
          retryable: true,
          details: { hint: 'retry later' },
        }),
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
          expect(result.current.error).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(result.current.tasks).toEqual([]);
      expect(result.current.error).toBeInstanceOf(ApiResponseError);
      expect(result.current.error).toMatchObject({
        message: 'Fetch failed',
        error_code: 'TASK_FETCH_FAILED',
        retryable: true,
        details: { hint: 'retry later' },
        status: 500,
      });
    });

    it('should fetch tasks with filters', async () => {
      const filters = {
        status: 'pending' as TaskStatus,
        task_type: 'repair' as TaskType,
      };
      const mockTasks = [mockTask];

      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTasks }),
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

      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      );
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('task_type=repair')
      );
    });
  });

  describe('fetchTaskById', () => {
    it('should fetch task by id successfully', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTask }),
      });

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
      expect(apiFetch).toHaveBeenCalledWith('/api/maintenance-tasks?id=1');
    });

    it('should handle fetch task by id error', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn().mockResolvedValue({ error: 'Not found' }),
      });

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
      expect(result.current.error).toBeDefined();
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

      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({ data: createdTask }),
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
      expect(apiFetch).toHaveBeenCalledWith('/api/maintenance-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTaskData),
      });
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

      (apiFetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({
          message: 'Create failed',
          error_code: 'TASK_CREATE_FAILED',
          retryable: false,
          details: { field: 'title' },
        }),
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await expect(
          result.current.createTask(newTaskData)
        ).rejects.toMatchObject({
          message: 'Create failed',
          error_code: 'TASK_CREATE_FAILED',
          retryable: false,
          details: { field: 'title' },
          status: 500,
        });
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
          expect(result.current.error).toMatchObject({
            message: 'Create failed',
            error_code: 'TASK_CREATE_FAILED',
            retryable: false,
            details: { field: 'title' },
            status: 500,
          });
        },
        { timeout: 3000 }
      );

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

      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ data: mockTask }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: updatedTask }),
        });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
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
      expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/maintenance-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '1',
          title: 'Updated Repair',
          status: 'in_progress',
        }),
      });
    });

    it('should handle update task error', async () => {
      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ data: mockTask }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValue({
            message: 'Update failed',
            error_code: 'TASK_UPDATE_FAILED',
            retryable: true,
          }),
        });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
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

      await act(async () => {
        await expect(
          result.current.updateTask('1', {
            title: 'Updated Repair',
          })
        ).rejects.toMatchObject({
          message: 'Update failed',
          error_code: 'TASK_UPDATE_FAILED',
          retryable: true,
          status: 500,
        });
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(result.current.error).toMatchObject({
        message: 'Update failed',
        error_code: 'TASK_UPDATE_FAILED',
        retryable: true,
        status: 500,
      });
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
      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ data: mockTask }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ success: true }),
        });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
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

      expect(apiFetch).toHaveBeenNthCalledWith(
        2,
        '/api/maintenance-tasks?id=1',
        { method: 'DELETE' }
      );
    });

    it('should handle delete task error', async () => {
      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ data: mockTask }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValue({
            message: 'Delete failed',
            error_code: 'TASK_DELETE_FAILED',
            retryable: false,
          }),
        });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      // First, manually set up tasks by creating one
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
        await expect(result.current.deleteTask('1')).rejects.toMatchObject({
          message: 'Delete failed',
          error_code: 'TASK_DELETE_FAILED',
          retryable: false,
          status: 500,
        });
      });

      await waitFor(
        () => {
          expect(result.current.loading.fetch).toBe(false);
          expect(result.current.loading.mutate).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(result.current.error).toMatchObject({
        message: 'Delete failed',
        error_code: 'TASK_DELETE_FAILED',
        retryable: false,
        status: 500,
      });
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
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTasks }),
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
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/maintenance-tasks?start_date=2024-01-01&end_date=2024-01-31'
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
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Fetch failed' }),
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
      expect(result.current.error).toBeDefined();
    });

    it('should pass abort signal to date range fetch', async () => {
      const controller = new AbortController();

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31', {
          signal: controller.signal,
        });
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/maintenance-tasks?start_date=2024-01-01&end_date=2024-01-31',
        { signal: controller.signal }
      );
    });

    it('should ignore aborted date range fetches without surfacing an error', async () => {
      const controller = new AbortController();
      controller.abort();

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      let fetchedTasks: MaintenanceTask[] = [];
      await act(async () => {
        fetchedTasks = await result.current.fetchTasksByDateRange(
          '2024-01-01',
          '2024-01-31',
          {
            signal: controller.signal,
            throwOnError: true,
          }
        );
      });

      expect(fetchedTasks).toEqual([]);
      expect(apiFetch).not.toHaveBeenCalled();
      expect(result.current.error).toBe(null);
      expect(mockHandleError).not.toHaveBeenCalled();
    });

    it('should rethrow date range errors when requested', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Fetch failed' }),
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await expect(
        act(async () => {
          await result.current.fetchTasksByDateRange(
            '2024-01-01',
            '2024-01-31',
            {
              throwOnError: true,
            }
          );
        })
      ).rejects.toThrow('Fetch failed');

      expect(result.current.error).toBeDefined();
    });
  });

  describe('fetchTasksByScheduledDate', () => {
    it('should fetch tasks by scheduled date successfully', async () => {
      const mockTasks = [mockTask];
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTasks }),
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
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/maintenance-tasks?scheduled_date=2024-01-05'
      );
    });

    it('should handle fetch tasks by scheduled date error', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Fetch failed' }),
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
      expect(result.current.error).toBeDefined();
    });
  });

  describe('fetchOverdueTasks', () => {
    it('should fetch overdue tasks successfully', async () => {
      const mockTasks = [mockTask];
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: mockTasks }),
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
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/maintenance-tasks?overdue=true'
      );
    });

    it('should handle fetch overdue tasks error', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Fetch failed' }),
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
      expect(result.current.error).toBeDefined();
    });
  });

  describe('Loading state', () => {
    it('should set loading state correctly during fetch', async () => {
      let resolveApiFetch: ((value: Response) => void) | null = null;
      const fetchPromise = new Promise<Response>(resolve => {
        resolveApiFetch = resolve;
      });

      (apiFetch as jest.Mock).mockReturnValueOnce(fetchPromise);

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
        if (resolveApiFetch) {
          resolveApiFetch({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ data: [] }),
          } as unknown as Response);
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

      (apiFetch as jest.Mock)
        // First call: fetchTasks
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [existingTask] }),
        })
        // Second call: fetchTasksByDateRange
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [newTask, duplicateTask] }),
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
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [] }),
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

    it('should reuse cached date range results for identical filters', async () => {
      const rangeTasks: MaintenanceTask[] = [
        { ...mockTask, id: 'cached-1', title: 'Cached Task' },
      ];

      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: rangeTasks }),
      });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31');
      });

      await act(async () => {
        await result.current.fetchTasksByDateRange('2024-01-01', '2024-01-31');
      });

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(result.current.tasks).toEqual(rangeTasks);
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

      (apiFetch as jest.Mock)
        // First call: fetchTasks
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [existingTask] }),
        })
        // Second call: fetchTasksByScheduledDate
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [newTask] }),
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

      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [task1] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [task2] }),
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

      const updatedTask: MaintenanceTask = {
        ...initialTask,
        title: 'Updated',
        status: 'in_progress' as TaskStatus,
      };

      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ data: initialTask }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: updatedTask }),
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

      (apiFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [mockTask] }),
      });

      renderHook(() => useMaintenanceTasks(filters));

      await waitFor(
        () => {
          expect(apiFetch).toHaveBeenCalledWith(
            expect.stringContaining('status=pending')
          );
        },
        { timeout: 3000 }
      );
    });

    it('should not fetch tasks on mount when no initialFilters and autoFetch is false', async () => {
      (apiFetch as jest.Mock).mockReset();

      renderHook(() => useMaintenanceTasks({ autoFetch: false }));

      // Wait for initial render and useEffect to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not call apiFetch when autoFetch is false
      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error state reset', () => {
    it('should reset error state on successful operation after error', async () => {
      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValue({ error: 'Initial error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [mockTask] }),
        });

      const { result } = renderHook(() =>
        useMaintenanceTasks({ autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchTasks();
      });

      await waitFor(
        () => {
          expect(result.current.error).toBeDefined();
          expect(result.current.error).not.toBeNull();
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

      (apiFetch as jest.Mock)
        // First call: fetchTasks
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [existingTask] }),
        })
        // Second call: fetchOverdueTasks
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ data: [overdueTask] }),
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
