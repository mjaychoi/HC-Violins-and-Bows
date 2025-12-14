'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useErrorHandler } from '@/contexts/ToastContext';
import { dataService } from '@/services/dataService';
import type { MaintenanceTask, TaskFilters } from '@/types';

interface UseMaintenanceTasksOptions {
  initialFilters?: TaskFilters;
  /**
   * Whether to automatically fetch tasks on mount
   * @default true
   */
  autoFetch?: boolean;
}

interface UseMaintenanceTasksReturn {
  tasks: MaintenanceTask[];
  loading: {
    fetch: boolean;
    mutate: boolean;
  };
  error: unknown;
  fetchTasks: (filters?: TaskFilters) => Promise<void>;
  fetchTaskById: (id: string) => Promise<MaintenanceTask | null>;
  createTask: (
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ) => Promise<MaintenanceTask | null>;
  updateTask: (
    id: string,
    updates: Partial<
      Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    >
  ) => Promise<MaintenanceTask | null>;
  deleteTask: (id: string) => Promise<void>;
  fetchTasksByDateRange: (
    startDate: string,
    endDate: string
  ) => Promise<MaintenanceTask[]>;
  fetchTasksByScheduledDate: (date: string) => Promise<MaintenanceTask[]>;
  fetchOverdueTasks: () => Promise<MaintenanceTask[]>;
}

/**
 * FIXED: Loading states separated (fetch vs mutate) to prevent UX confusion
 * FIXED: Stale guard (reqIdRef) added to fetchTasks to prevent race conditions
 * FIXED: autoFetch option added - now fetches by default even without initialFilters
 * FIXED: createTask type matches interface declaration (removed 'client' from omit)
 */
export function useMaintenanceTasks(
  options: UseMaintenanceTasksOptions | TaskFilters = {}
): UseMaintenanceTasksReturn {
  // Backward compatibility: if options is TaskFilters, treat as initialFilters
  // Check if options is a UseMaintenanceTasksOptions object (has initialFilters or autoFetch property)
  const opts: UseMaintenanceTasksOptions =
    options &&
    typeof options === 'object' &&
    ('initialFilters' in options || 'autoFetch' in options)
      ? (options as UseMaintenanceTasksOptions)
      : { initialFilters: options as TaskFilters };

  const { initialFilters, autoFetch = true } = opts;

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState({ fetch: false, mutate: false });
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();

  // Stale guard for fetchTasks to prevent race conditions
  const fetchReqIdRef = useRef(0);

  // FIXED: Counter pattern for fetch loading to handle overlapping fetch operations
  // Multiple fetch functions (fetchTasks, fetchTaskById, fetchTasksByDateRange, etc.)
  // all share the same loading.fetch state, so we need a counter to prevent race conditions
  const fetchCountRef = useRef(0);
  const startFetch = useCallback(() => {
    fetchCountRef.current += 1;
    setLoading(prev => ({ ...prev, fetch: true }));
  }, []);
  const endFetch = useCallback(() => {
    fetchCountRef.current = Math.max(0, fetchCountRef.current - 1);
    if (fetchCountRef.current === 0) {
      setLoading(prev => ({ ...prev, fetch: false }));
    }
  }, []);

  // FIXED: Prevent StrictMode double-run in development
  const didFetchRef = useRef(false);

  // FIXED: Added stale guard to prevent out-of-order responses from overwriting newer data
  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      const myId = ++fetchReqIdRef.current;
      setLoading(prev => ({ ...prev, fetch: true }));
      setError(null);

      try {
        const effectiveFilters = filters || initialFilters;
        const { data, error } =
          await dataService.fetchMaintenanceTasks(effectiveFilters);

        // Stale guard: ignore if a newer request has started
        if (myId !== fetchReqIdRef.current) {
          return;
        }

        if (error) {
          setError(error);
          handleError(error, 'Failed to fetch maintenance tasks');
          setTasks([]);
          return;
        }

        setTasks(data || []);
      } catch (err) {
        // Stale guard: ignore if a newer request has started
        if (myId !== fetchReqIdRef.current) {
          return;
        }
        setError(err);
        handleError(err, 'Failed to fetch maintenance tasks');
      } finally {
        // Only clear loading if this is still the latest request
        if (myId === fetchReqIdRef.current) {
          endFetch();
        }
      }
    },
    [initialFilters, handleError, endFetch]
  );

  const fetchTaskById = useCallback(
    async (id: string): Promise<MaintenanceTask | null> => {
      startFetch();
      setError(null);

      try {
        const { data, error } = await dataService.fetchMaintenanceTaskById(id);

        if (error) {
          setError(error);
          handleError(error, 'Failed to fetch maintenance task');
          return null;
        }

        return data;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch maintenance task');
        return null;
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch]
  );

  // FIXED: Type now matches interface - 'client' is included in Omit
  const createTask = useCallback(
    async (
      task: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    ): Promise<MaintenanceTask | null> => {
      setLoading(prev => ({ ...prev, mutate: true }));
      setError(null);

      try {
        const { data, error } = await dataService.createMaintenanceTask(task);

        if (error) {
          setError(error);
          handleError(error, 'Failed to create maintenance task');
          return null;
        }

        if (data) {
          setTasks(prev => [data, ...prev]);
        }

        return data ?? null;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to create maintenance task');
        return null;
      } finally {
        setLoading(prev => ({ ...prev, mutate: false }));
      }
    },
    [handleError]
  );

  const updateTask = useCallback(
    async (
      id: string,
      updates: Partial<
        Omit<
          MaintenanceTask,
          'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
        >
      >
    ): Promise<MaintenanceTask | null> => {
      setLoading(prev => ({ ...prev, mutate: true }));
      setError(null);

      try {
        const { data, error } = await dataService.updateMaintenanceTask(
          id,
          updates
        );

        if (error) {
          setError(error);
          handleError(error, 'Failed to update maintenance task');
          return null;
        }

        if (data) {
          setTasks(prev => prev.map(task => (task.id === id ? data : task)));
        }

        return data ?? null;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to update maintenance task');
        return null;
      } finally {
        setLoading(prev => ({ ...prev, mutate: false }));
      }
    },
    [handleError]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setLoading(prev => ({ ...prev, mutate: true }));
      setError(null);

      try {
        const { error } = await dataService.deleteMaintenanceTask(id);
        if (error) {
          setError(error);
          handleError(error, 'Failed to delete maintenance task');
          return;
        }

        setTasks(prev => prev.filter(task => task.id !== id));
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to delete maintenance task');
      } finally {
        setLoading(prev => ({ ...prev, mutate: false }));
      }
    },
    [handleError]
  );

  const fetchTasksByDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<MaintenanceTask[]> => {
      setLoading(prev => ({ ...prev, fetch: true }));
      setError(null);

      try {
        const { data, error } = await dataService.fetchTasksByDateRange(
          startDate,
          endDate
        );

        if (error) {
          setError(error);
          handleError(error, 'Failed to fetch tasks by date range');
          return [];
        }

        const tasksResult = data || [];
        setTasks(prevTasks => {
          const existingIds = new Set(prevTasks.map(t => t.id));
          const newTasks = tasksResult.filter(t => !existingIds.has(t.id));
          return [...prevTasks, ...newTasks];
        });
        return tasksResult;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch tasks by date range');
        return [];
      } finally {
        setLoading(prev => ({ ...prev, fetch: false }));
      }
    },
    [handleError]
  );

  const fetchTasksByScheduledDate = useCallback(
    async (date: string): Promise<MaintenanceTask[]> => {
      startFetch();
      setError(null);

      try {
        const { data, error } =
          await dataService.fetchTasksByScheduledDate(date);

        if (error) {
          setError(error);
          handleError(error, 'Failed to fetch tasks by scheduled date');
          return [];
        }

        const tasksResult = data || [];
        // FIXED: Merge updates to existing tasks instead of only adding new ones
        setTasks(prevTasks => {
          const map = new Map(prevTasks.map(t => [t.id, t]));
          for (const t of tasksResult) {
            map.set(t.id, t); // This will update existing tasks with new data
          }
          return Array.from(map.values());
        });
        return tasksResult;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch tasks by scheduled date');
        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch]
  );

  const fetchOverdueTasks = useCallback(async (): Promise<
    MaintenanceTask[]
  > => {
    startFetch();
    setError(null);

    try {
      const { data, error } = await dataService.fetchOverdueTasks();
      if (error) {
        setError(error);
        handleError(error, 'Failed to fetch overdue tasks');
        return [];
      }

      return data || [];
    } catch (err) {
      setError(err);
      handleError(err, 'Failed to fetch overdue tasks');
      return [];
    } finally {
      endFetch();
    }
  }, [handleError, startFetch, endFetch]);

  // FIXED: Now fetches by default even without initialFilters (autoFetch option)
  // FIXED: Prevent StrictMode double-run in development (didFetchRef guard)
  useEffect(() => {
    if (!autoFetch || didFetchRef.current) return;
    didFetchRef.current = true;
    fetchTasks(initialFilters);
  }, [autoFetch, fetchTasks, initialFilters]);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    fetchTaskById,
    createTask,
    updateTask,
    deleteTask,
    fetchTasksByDateRange,
    fetchTasksByScheduledDate,
    fetchOverdueTasks,
  };
}
