'use client';

import { useState, useCallback, useEffect } from 'react';
import { SupabaseHelpers } from '@/utils/supabaseHelpers';
import { useErrorHandler } from './useErrorHandler';
import { logError } from '@/utils/logger';
import type {
  MaintenanceTask,
  TaskFilters,
} from '@/types';

interface UseMaintenanceTasksReturn {
  tasks: MaintenanceTask[];
  loading: boolean;
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
      Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>
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

export function useMaintenanceTasks(
  initialFilters?: TaskFilters
): UseMaintenanceTasksReturn {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();

  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } =
          await SupabaseHelpers.fetchMaintenanceTasks(filters || initialFilters);

        if (fetchError) {
          throw fetchError;
        }

        setTasks(data || []);
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch maintenance tasks');
      } finally {
        setLoading(false);
      }
    },
    [initialFilters, handleError]
  );

  const fetchTaskById = useCallback(
    async (id: string): Promise<MaintenanceTask | null> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } =
          await SupabaseHelpers.fetchMaintenanceTaskById(id);

        if (fetchError) {
          throw fetchError;
        }

        return data;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch maintenance task');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const createTask = useCallback(
    async (
      task: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument'
      >
    ): Promise<MaintenanceTask | null> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: createError } =
          await SupabaseHelpers.createMaintenanceTask(task);

        if (createError) {
          throw createError;
        }

        if (data) {
          setTasks(prev => [data, ...prev]);
        }

        return data;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to create maintenance task');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const updateTask = useCallback(
    async (
      id: string,
      updates: Partial<
        Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>
      >
    ): Promise<MaintenanceTask | null> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: updateError } =
          await SupabaseHelpers.updateMaintenanceTask(id, updates);

        if (updateError) {
          throw updateError;
        }

        if (data) {
          setTasks(prev =>
            prev.map(task => (task.id === id ? data : task))
          );
        }

        return data;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to update maintenance task');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);

      try {
        const { error: deleteError } =
          await SupabaseHelpers.deleteMaintenanceTask(id);

        if (deleteError) {
          throw deleteError;
        }

        setTasks(prev => prev.filter(task => task.id !== id));
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to delete maintenance task');
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const fetchTasksByDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<MaintenanceTask[]> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } =
          await SupabaseHelpers.fetchTasksByDateRange(startDate, endDate);

        if (fetchError) {
          throw fetchError;
        }

        const tasks = data || [];
        // 상태 업데이트
        setTasks(prevTasks => {
          // 중복 제거 및 병합
          const existingIds = new Set(prevTasks.map(t => t.id));
          const newTasks = tasks.filter(t => !existingIds.has(t.id));
          return [...prevTasks, ...newTasks];
        });
        return tasks;
      } catch (err) {
        setError(err);
        logError(
          'Failed to fetch tasks by date range',
          err,
          'useMaintenanceTasks',
          {
            operation: 'fetchTasksByDateRange',
            startDate,
            endDate,
          }
        );
        handleError(err, 'Failed to fetch tasks by date range');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const fetchTasksByScheduledDate = useCallback(
    async (date: string): Promise<MaintenanceTask[]> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } =
          await SupabaseHelpers.fetchTasksByScheduledDate(date);

        if (fetchError) {
          throw fetchError;
        }

        const tasks = data || [];
        // 상태 업데이트
        setTasks(prevTasks => {
          // 중복 제거 및 병합
          const existingIds = new Set(prevTasks.map(t => t.id));
          const newTasks = tasks.filter(t => !existingIds.has(t.id));
          return [...prevTasks, ...newTasks];
        });
        return tasks;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch tasks by scheduled date');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const fetchOverdueTasks = useCallback(async (): Promise<MaintenanceTask[]> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } =
        await SupabaseHelpers.fetchOverdueTasks();

      if (fetchError) {
        throw fetchError;
      }

      return data || [];
    } catch (err) {
      setError(err);
      handleError(err, 'Failed to fetch overdue tasks');
      return [];
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  // Initial fetch
  useEffect(() => {
    if (initialFilters) {
      fetchTasks(initialFilters);
    }
  }, [fetchTasks, initialFilters]);

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

