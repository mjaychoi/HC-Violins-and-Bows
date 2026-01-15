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
 * FIXED:
 * - fetch/mutate 로딩 분리
 * - fetch 로딩은 counter로 관리 (여러 fetch가 겹쳐도 안정적으로 true/false 유지)
 * - fetchTasks는 stale guard(reqIdRef) + counter를 함께 사용
 * - enabledProp(initialFilters/autoFetch) backward compatibility 유지
 * - StrictMode double-run 방지(개발) didFetchRef
 */
export function useMaintenanceTasks(
  options: UseMaintenanceTasksOptions | TaskFilters = {}
): UseMaintenanceTasksReturn {
  // Backward compatibility:
  // - options가 { initialFilters, autoFetch } 형태면 그대로 사용
  // - 아니면 TaskFilters로 보고 initialFilters로 래핑
  const opts: UseMaintenanceTasksOptions =
    options &&
    typeof options === 'object' &&
    ('initialFilters' in options || 'autoFetch' in options)
      ? (options as UseMaintenanceTasksOptions)
      : { initialFilters: options as TaskFilters };

  const { initialFilters, autoFetch = true } = opts;

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState<{ fetch: boolean; mutate: boolean }>({
    fetch: false,
    mutate: false,
  });
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();

  // Stale guard for fetchTasks
  const fetchReqIdRef = useRef(0);

  // Shared fetch loading counter
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

  // StrictMode double-run guard (dev)
  const didFetchRef = useRef(false);

  /**
   * Fetch tasks (list)
   * - stale guard로 최신 요청만 반영
   * - fetch loading은 counter로 안전하게 관리
   */
  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      const myId = ++fetchReqIdRef.current;
      startFetch();
      setError(null);

      try {
        const effectiveFilters = filters ?? initialFilters;
        const { data, error: svcError } =
          await dataService.fetchMaintenanceTasks(effectiveFilters);

        // ignore stale response
        if (myId !== fetchReqIdRef.current) return;

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to fetch maintenance tasks');
          setTasks([]);
          return;
        }

        setTasks(data ?? []);
      } catch (err) {
        if (myId !== fetchReqIdRef.current) return;
        setError(err);
        handleError(err, 'Failed to fetch maintenance tasks');
      } finally {
        // only endFetch if still latest request (prevents flicker)
        if (myId === fetchReqIdRef.current) endFetch();
      }
    },
    [initialFilters, handleError, startFetch, endFetch]
  );

  const fetchTaskById = useCallback(
    async (id: string): Promise<MaintenanceTask | null> => {
      startFetch();
      setError(null);

      try {
        const { data, error: svcError } =
          await dataService.fetchMaintenanceTaskById(id);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to fetch maintenance task');
          return null;
        }

        return data ?? null;
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
        const { data, error: svcError } =
          await dataService.createMaintenanceTask(task);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to create maintenance task');
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
        const { data, error: svcError } =
          await dataService.updateMaintenanceTask(id, updates);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to update maintenance task');
          return null;
        }

        if (data) {
          setTasks(prev => prev.map(t => (t.id === id ? data : t)));
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
        const { error: svcError } = await dataService.deleteMaintenanceTask(id);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to delete maintenance task');
          return;
        }

        setTasks(prev => prev.filter(t => t.id !== id));
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
      startFetch();
      setError(null);

      try {
        const { data, error: svcError } =
          await dataService.fetchTasksByDateRange(startDate, endDate);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to fetch tasks by date range');
          return [];
        }

        const tasksResult = data ?? [];

        // Merge (add new only). If you want "update existing too", use Map merge like below.
        setTasks(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newOnes = tasksResult.filter(t => !existingIds.has(t.id));
          return [...prev, ...newOnes];
        });

        return tasksResult;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch tasks by date range');
        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch]
  );

  const fetchTasksByScheduledDate = useCallback(
    async (date: string): Promise<MaintenanceTask[]> => {
      startFetch();
      setError(null);

      try {
        const { data, error: svcError } =
          await dataService.fetchTasksByScheduledDate(date);

        if (svcError) {
          setError(svcError);
          handleError(svcError, 'Failed to fetch tasks by scheduled date');
          return [];
        }

        const tasksResult = data ?? [];

        // Merge updates to existing tasks (update existing + add new)
        setTasks(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          for (const t of tasksResult) map.set(t.id, t);
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
      const { data, error: svcError } = await dataService.fetchOverdueTasks();

      if (svcError) {
        setError(svcError);
        handleError(svcError, 'Failed to fetch overdue tasks');
        return [];
      }

      return data ?? [];
    } catch (err) {
      setError(err);
      handleError(err, 'Failed to fetch overdue tasks');
      return [];
    } finally {
      endFetch();
    }
  }, [handleError, startFetch, endFetch]);

  // autoFetch (default true) + StrictMode dev double-run guard
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
