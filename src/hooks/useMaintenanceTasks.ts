// src/hooks/useMaintenanceTasks.ts

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useErrorHandler } from '@/contexts/ToastContext';
import type { MaintenanceTask, TaskFilters } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { handleApiResponse } from '@/utils/handleApiResponse';
import { errorHandler } from '@/utils/errorHandler';
import type { AppError } from '@/types/errors';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import {
  buildMaintenanceTaskQuery,
  type MaintenanceTaskQuery,
} from '@/types/api/maintenanceTasks';

interface UseMaintenanceTasksOptions {
  initialFilters?: TaskFilters;
  autoFetch?: boolean;
}

interface UseMaintenanceTasksReturn {
  tasks: MaintenanceTask[];
  loading: {
    fetch: boolean;
    mutate: boolean;
  };
  error: unknown;
  displayError: AppError | null;
  fetchTasks: (filters?: TaskFilters) => Promise<void>;
  fetchTaskById: (id: string) => Promise<MaintenanceTask | null>;
  createTask: (
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ) => Promise<MaintenanceTask>;
  updateTask: (
    id: string,
    updates: Partial<
      Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    >
  ) => Promise<MaintenanceTask>;
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

function generateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

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
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

export function __resetMaintenanceTasksReadCacheForTests() {
  maintenanceTasksReadCache.clear();
}

export function useMaintenanceTasks(
  options: UseMaintenanceTasksOptions | TaskFilters = {}
): UseMaintenanceTasksReturn {
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
  const [displayError, setDisplayError] = useState<AppError | null>(null);

  const { handleError } = useErrorHandler();
  const { tenantIdentityKey } = useTenantIdentity();

  const fetchReqIdRef = useRef(0);
  const fetchCountRef = useRef(0);
  const mutateCountRef = useRef(0);
  const didFetchRef = useRef(false);
  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  useEffect(() => {
    tenantIdentityKeyRef.current = tenantIdentityKey;
  }, [tenantIdentityKey]);

  const makeCacheKey = useCallback((scope: string) => {
    return `${tenantIdentityKeyRef.current ?? '__no_tenant__'}:${scope}`;
  }, []);

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

  const startMutate = useCallback(() => {
    mutateCountRef.current += 1;
    setLoading(prev => ({ ...prev, mutate: true }));
  }, []);

  const endMutate = useCallback(() => {
    mutateCountRef.current = Math.max(0, mutateCountRef.current - 1);

    if (mutateCountRef.current === 0) {
      setLoading(prev => ({ ...prev, mutate: false }));
    }
  }, []);

  useEffect(() => {
    invalidateMaintenanceTasksCache();
    setTasks([]);
    setError(null);
    setDisplayError(null);

    fetchReqIdRef.current += 1;
    fetchCountRef.current = 0;
    mutateCountRef.current = 0;
    didFetchRef.current = false;

    setLoading({ fetch: false, mutate: false });
  }, [tenantIdentityKey]);

  const mergeTasksIntoState = useCallback((nextTasks: MaintenanceTask[]) => {
    setTasks(prev => {
      const map = new Map(prev.map(task => [task.id, task]));

      for (const task of nextTasks) {
        map.set(task.id, task);
      }

      return Array.from(map.values());
    });
  }, []);

  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      const myId = ++fetchReqIdRef.current;
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;

      startFetch();
      setError(null);
      setDisplayError(null);

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
        const cacheKey = makeCacheKey(`list:${queryString}`);
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks) {
          if (
            myId !== fetchReqIdRef.current ||
            tenantIdentityKeyRef.current !== requestTenantIdentityKey
          ) {
            return;
          }
          setTasks(cachedTasks);
          return;
        }

        const res = await apiFetch(`/api/maintenance-tasks${queryString}`);

        if (
          myId !== fetchReqIdRef.current ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey
        ) {
          return;
        }

        const data = await handleApiResponse<MaintenanceTask[]>(
          res,
          `Failed to fetch maintenance tasks (${res.status})`
        );

        const nextTasks = data ?? [];
        setTasks(nextTasks);
        setCachedMaintenanceTasks(cacheKey, nextTasks);
      } catch (err) {
        if (
          myId !== fetchReqIdRef.current ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey
        ) {
          return;
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to fetch maintenance tasks') ??
          errorHandler.normalizeError(err, 'Failed to fetch maintenance tasks');

        setDisplayError(appError);
        setTasks([]);
      } finally {
        endFetch();
      }
    },
    [initialFilters, handleError, startFetch, endFetch, makeCacheKey]
  );

  const fetchTaskById = useCallback(
    async (id: string): Promise<MaintenanceTask | null> => {
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startFetch();
      setError(null);
      setDisplayError(null);

      try {
        const queryString = buildMaintenanceTaskQuery({ id });
        const cacheKey = makeCacheKey(`detail:${queryString}`);
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks?.[0]) {
          if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
            return null;
          }
          return cachedTasks[0];
        }

        const res = await apiFetch(`/api/maintenance-tasks${queryString}`);
        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          return null;
        }

        const task = await handleApiResponse<MaintenanceTask>(
          res,
          `Failed to fetch maintenance task (${res.status})`
        );

        setCachedMaintenanceTasks(cacheKey, [task]);
        return task;
      } catch (err) {
        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          return null;
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to fetch maintenance task') ??
          errorHandler.normalizeError(err, 'Failed to fetch maintenance task');

        setDisplayError(appError);
        return null;
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch, makeCacheKey]
  );

  const createTask = useCallback(
    async (
      task: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    ): Promise<MaintenanceTask> => {
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startMutate();
      setError(null);
      setDisplayError(null);

      try {
        const res = await apiFetch(
          '/api/maintenance-tasks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task),
          },
          { idempotencyKey: generateIdempotencyKey('maintenance-task-create') }
        );

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during createTask',
            'AbortError'
          );
        }

        const data = await handleApiResponse<MaintenanceTask>(
          res,
          `Failed to create maintenance task (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during createTask',
            'AbortError'
          );
        }

        invalidateMaintenanceTasksCache();
        setTasks(prev => [data, ...prev.filter(task => task.id !== data.id)]);

        return data;
      } catch (err) {
        if (
          tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
          isAuthLikeTenantError(err)
        ) {
          invalidateMaintenanceTasksCache();
          if (isAuthLikeTenantError(err)) {
            setTasks([]);
          }
          throw err;
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to create maintenance task') ??
          errorHandler.normalizeError(err, 'Failed to create maintenance task');

        setDisplayError(appError);
        throw err;
      } finally {
        endMutate();
      }
    },
    [handleError, startMutate, endMutate]
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
    ): Promise<MaintenanceTask> => {
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startMutate();
      setError(null);
      setDisplayError(null);

      try {
        const res = await apiFetch('/api/maintenance-tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...updates }),
        });

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during updateTask',
            'AbortError'
          );
        }

        const data = await handleApiResponse<MaintenanceTask>(
          res,
          `Failed to update maintenance task (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during updateTask',
            'AbortError'
          );
        }

        invalidateMaintenanceTasksCache();
        setTasks(prev => prev.map(t => (t.id === id ? data : t)));

        return data;
      } catch (err) {
        if (
          tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
          isAuthLikeTenantError(err)
        ) {
          invalidateMaintenanceTasksCache();
          if (isAuthLikeTenantError(err)) {
            setTasks([]);
          }
          throw err;
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to update maintenance task') ??
          errorHandler.normalizeError(err, 'Failed to update maintenance task');

        setDisplayError(appError);
        throw err;
      } finally {
        endMutate();
      }
    },
    [handleError, startMutate, endMutate]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startMutate();
      setError(null);
      setDisplayError(null);

      try {
        const res = await apiFetch(
          `/api/maintenance-tasks${buildMaintenanceTaskQuery({ id })}`,
          { method: 'DELETE' }
        );

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during deleteTask',
            'AbortError'
          );
        }

        await handleApiResponse<null>(
          res,
          `Failed to delete maintenance task (${res.status})`,
          { allowSuccessWithoutData: true }
        );

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          throw new DOMException(
            'Tenant changed during deleteTask',
            'AbortError'
          );
        }

        invalidateMaintenanceTasksCache();
        setTasks(prev => prev.filter(t => t.id !== id));
      } catch (err) {
        if (
          tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
          isAuthLikeTenantError(err)
        ) {
          invalidateMaintenanceTasksCache();
          if (isAuthLikeTenantError(err)) {
            setTasks([]);
          }
          throw err;
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to delete maintenance task') ??
          errorHandler.normalizeError(err, 'Failed to delete maintenance task');

        setDisplayError(appError);
        throw err;
      } finally {
        endMutate();
      }
    },
    [handleError, startMutate, endMutate]
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
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startFetch();
      setError(null);
      setDisplayError(null);

      try {
        if (options?.signal?.aborted) return [];

        const queryString = buildMaintenanceTaskQuery({
          start_date: startDate,
          end_date: endDate,
        });

        const cacheKey = makeCacheKey(`range:${queryString}`);
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks) {
          if (
            options?.signal?.aborted ||
            tenantIdentityKeyRef.current !== requestTenantIdentityKey
          ) {
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

        if (
          options?.signal?.aborted ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey
        ) {
          return [];
        }

        mergeTasksIntoState(tasksResult);
        setCachedMaintenanceTasks(cacheKey, tasksResult);

        return tasksResult;
      } catch (err) {
        if (
          options?.signal?.aborted ||
          isAbortError(err) ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey
        ) {
          return [];
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to fetch tasks by date range') ??
          errorHandler.normalizeError(
            err,
            'Failed to fetch tasks by date range'
          );

        setDisplayError(appError);

        if (options?.throwOnError) {
          throw err;
        }

        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch, mergeTasksIntoState, makeCacheKey]
  );

  const fetchTasksByScheduledDate = useCallback(
    async (date: string): Promise<MaintenanceTask[]> => {
      const requestTenantIdentityKey = tenantIdentityKeyRef.current;
      startFetch();
      setError(null);
      setDisplayError(null);

      try {
        const queryString = buildMaintenanceTaskQuery({
          scheduled_date: date,
        });

        const cacheKey = makeCacheKey(`scheduled:${queryString}`);
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks) {
          if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
            return [];
          }
          mergeTasksIntoState(cachedTasks);
          return cachedTasks;
        }

        const res = await apiFetch(`/api/maintenance-tasks${queryString}`);

        const tasksResult =
          (await handleApiResponse<MaintenanceTask[]>(
            res,
            `Failed to fetch tasks by scheduled date (${res.status})`
          )) ?? [];

        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          return [];
        }

        mergeTasksIntoState(tasksResult);
        setCachedMaintenanceTasks(cacheKey, tasksResult);

        return tasksResult;
      } catch (err) {
        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          return [];
        }

        setError(err);

        const appError =
          handleError(err, 'Failed to fetch tasks by scheduled date') ??
          errorHandler.normalizeError(
            err,
            'Failed to fetch tasks by scheduled date'
          );

        setDisplayError(appError);
        return [];
      } finally {
        endFetch();
      }
    },
    [handleError, startFetch, endFetch, mergeTasksIntoState, makeCacheKey]
  );

  const fetchOverdueTasks = useCallback(async (): Promise<
    MaintenanceTask[]
  > => {
    const requestTenantIdentityKey = tenantIdentityKeyRef.current;
    startFetch();
    setError(null);
    setDisplayError(null);

    try {
      const queryString = buildMaintenanceTaskQuery({
        overdue: true,
      });

      const cacheKey = makeCacheKey(`overdue:${queryString}`);
      const cachedTasks = getCachedMaintenanceTasks(cacheKey);

      if (cachedTasks) {
        if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
          return [];
        }
        return cachedTasks;
      }

      const res = await apiFetch(`/api/maintenance-tasks${queryString}`);

      const tasksResult =
        (await handleApiResponse<MaintenanceTask[]>(
          res,
          `Failed to fetch overdue tasks (${res.status})`
        )) ?? [];

      if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
        return [];
      }

      setCachedMaintenanceTasks(cacheKey, tasksResult);

      return tasksResult;
    } catch (err) {
      if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
        return [];
      }

      setError(err);

      const appError =
        handleError(err, 'Failed to fetch overdue tasks') ??
        errorHandler.normalizeError(err, 'Failed to fetch overdue tasks');

      setDisplayError(appError);
      return [];
    } finally {
      endFetch();
    }
  }, [handleError, startFetch, endFetch, makeCacheKey]);

  useEffect(() => {
    if (!autoFetch || didFetchRef.current) return;

    didFetchRef.current = true;
    void fetchTasks(initialFilters);
  }, [autoFetch, fetchTasks, initialFilters]);

  return {
    tasks,
    loading,
    error,
    displayError,
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
