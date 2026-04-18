'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useErrorHandler } from '@/contexts/ToastContext';
import type { MaintenanceTask, TaskFilters } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { handleApiResponse } from '@/utils/handleApiResponse';
import {
  buildMaintenanceTaskQuery,
  type MaintenanceTaskQuery,
} from '@/types/api/maintenanceTasks';

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
    endDate: string,
    options?: {
      signal?: AbortSignal;
      throwOnError?: boolean;
      suppressErrorToast?: boolean;
    }
  ) => Promise<MaintenanceTask[]>;
  fetchTasksByScheduledDate: (date: string) => Promise<MaintenanceTask[]>;
  fetchOverdueTasks: () => Promise<MaintenanceTask[]>;
}

const MAINTENANCE_TASKS_CACHE_TTL_MS = 30_000;

type MaintenanceTasksCacheEntry = {
  data: MaintenanceTask[];
  expiresAt: number;
};

const maintenanceTasksReadCache = new Map<string, MaintenanceTasksCacheEntry>();

function getCachedMaintenanceTasks(cacheKey: string) {
  const entry = maintenanceTasksReadCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    maintenanceTasksReadCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedMaintenanceTasks(cacheKey: string, data: MaintenanceTask[]) {
  maintenanceTasksReadCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + MAINTENANCE_TASKS_CACHE_TTL_MS,
  });
}

function invalidateMaintenanceTasksCache() {
  maintenanceTasksReadCache.clear();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function __resetMaintenanceTasksReadCacheForTests() {
  maintenanceTasksReadCache.clear();
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

  const mergeTasksIntoState = useCallback((nextTasks: MaintenanceTask[]) => {
    setTasks(prev => {
      const map = new Map(prev.map(task => [task.id, task]));
      for (const task of nextTasks) {
        map.set(task.id, task);
      }
      return Array.from(map.values());
    });
  }, []);

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
        const query: MaintenanceTaskQuery = {
          instrument_id: effectiveFilters?.instrument_id,
          status: effectiveFilters?.status,
          task_type: effectiveFilters?.task_type,
          priority: effectiveFilters?.priority,
          search: effectiveFilters?.search,
          start_date: effectiveFilters?.date_from,
          end_date: effectiveFilters?.date_to,
        };
        const queryString = buildMaintenanceTaskQuery(query);
        const requestUrl = `/api/maintenance-tasks${queryString}`;
        const cacheKey = `list:${queryString}`;
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks) {
          if (myId !== fetchReqIdRef.current) return;
          setTasks(cachedTasks);
          return;
        }

        const res = await apiFetch(requestUrl);

        // ignore stale response
        if (myId !== fetchReqIdRef.current) return;

        const data = await handleApiResponse<MaintenanceTask[]>(
          res,
          `Failed to fetch maintenance tasks (${res.status})`
        );
        const nextTasks = data ?? [];
        setTasks(nextTasks);
        setCachedMaintenanceTasks(cacheKey, nextTasks);
      } catch (err) {
        if (myId !== fetchReqIdRef.current) return;
        setError(err);
        handleError(err, 'Failed to fetch maintenance tasks');
        setTasks([]);
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
        const queryString = buildMaintenanceTaskQuery({ id });
        const cacheKey = `detail:${queryString}`;
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);
        if (cachedTasks && cachedTasks[0]) {
          return cachedTasks[0];
        }

        const res = await apiFetch(`/api/maintenance-tasks${queryString}`);
        const task =
          (await handleApiResponse<MaintenanceTask | null>(
            res,
            `Failed to fetch maintenance task (${res.status})`
          )) ?? null;
        if (task) {
          setCachedMaintenanceTasks(cacheKey, [task]);
        }
        return task;
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
        const res = await apiFetch('/api/maintenance-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        });
        const data =
          (await handleApiResponse<MaintenanceTask | null>(
            res,
            `Failed to create maintenance task (${res.status})`
          )) ?? null;
        if (data) {
          invalidateMaintenanceTasksCache();
          setTasks(prev => [data, ...prev]);
        }

        return data ?? null;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to create maintenance task');
        throw err;
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
        const res = await apiFetch('/api/maintenance-tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...updates }),
        });
        const data =
          (await handleApiResponse<MaintenanceTask | null>(
            res,
            `Failed to update maintenance task (${res.status})`
          )) ?? null;
        if (data) {
          invalidateMaintenanceTasksCache();
          setTasks(prev => prev.map(t => (t.id === id ? data : t)));
        }

        return data ?? null;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to update maintenance task');
        throw err;
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
        const res = await apiFetch(
          `/api/maintenance-tasks${buildMaintenanceTaskQuery({ id })}`,
          {
            method: 'DELETE',
          }
        );
        await handleApiResponse<null>(
          res,
          `Failed to delete maintenance task (${res.status})`
        );

        invalidateMaintenanceTasksCache();
        setTasks(prev => prev.filter(t => t.id !== id));
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to delete maintenance task');
        throw err;
      } finally {
        setLoading(prev => ({ ...prev, mutate: false }));
      }
    },
    [handleError]
  );

  const fetchTasksByDateRange = useCallback(
    async (
      startDate: string,
      endDate: string,
      options?: {
        signal?: AbortSignal;
        throwOnError?: boolean;
        suppressErrorToast?: boolean;
      }
    ): Promise<MaintenanceTask[]> => {
      startFetch();
      setError(null);

      try {
        if (options?.signal?.aborted) {
          return [];
        }

        const queryString = buildMaintenanceTaskQuery({
          start_date: startDate,
          end_date: endDate,
        });
        const cacheKey = `range:${queryString}`;
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);
        if (cachedTasks) {
          if (options?.signal?.aborted) {
            return [];
          }
          mergeTasksIntoState(cachedTasks);
          return cachedTasks;
        }

        const requestUrl = `/api/maintenance-tasks${queryString}`;
        const res = options?.signal
          ? await apiFetch(requestUrl, { signal: options.signal })
          : await apiFetch(requestUrl);
        const tasksResult =
          (await handleApiResponse<MaintenanceTask[]>(
            res,
            `Failed to fetch tasks by date range (${res.status})`
          )) ?? [];

        if (options?.signal?.aborted) {
          return [];
        }

        mergeTasksIntoState(tasksResult);
        setCachedMaintenanceTasks(cacheKey, tasksResult);

        return tasksResult;
      } catch (err) {
        if (options?.signal?.aborted || isAbortError(err)) {
          return [];
        }

        setError(err);
        if (!options?.suppressErrorToast) {
          handleError(err, 'Failed to fetch tasks by date range');
        }
        if (options?.throwOnError) {
          throw err;
        }
        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch, mergeTasksIntoState]
  );

  const fetchTasksByScheduledDate = useCallback(
    async (date: string): Promise<MaintenanceTask[]> => {
      startFetch();
      setError(null);

      try {
        const queryString = buildMaintenanceTaskQuery({
          scheduled_date: date,
        });
        const cacheKey = `scheduled:${queryString}`;
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);
        if (cachedTasks) {
          mergeTasksIntoState(cachedTasks);
          return cachedTasks;
        }

        const res = await apiFetch(`/api/maintenance-tasks${queryString}`);
        const tasksResult =
          (await handleApiResponse<MaintenanceTask[]>(
            res,
            `Failed to fetch tasks by scheduled date (${res.status})`
          )) ?? [];

        mergeTasksIntoState(tasksResult);
        setCachedMaintenanceTasks(cacheKey, tasksResult);

        return tasksResult;
      } catch (err) {
        setError(err);
        handleError(err, 'Failed to fetch tasks by scheduled date');
        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch, mergeTasksIntoState]
  );

  const fetchOverdueTasks = useCallback(async (): Promise<
    MaintenanceTask[]
  > => {
    startFetch();
    setError(null);

    try {
      const queryString = buildMaintenanceTaskQuery({
        overdue: true,
      });
      const cacheKey = `overdue:${queryString}`;
      const cachedTasks = getCachedMaintenanceTasks(cacheKey);
      if (cachedTasks) {
        return cachedTasks;
      }

      const res = await apiFetch(`/api/maintenance-tasks${queryString}`);
      const tasksResult =
        (await handleApiResponse<MaintenanceTask[]>(
          res,
          `Failed to fetch overdue tasks (${res.status})`
        )) ?? [];
      setCachedMaintenanceTasks(cacheKey, tasksResult);
      return tasksResult;
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
