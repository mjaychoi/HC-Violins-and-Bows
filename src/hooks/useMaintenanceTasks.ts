// src/hooks/useMaintenanceTasks.ts

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { addDays, format } from 'date-fns';
import { useErrorHandler } from '@/contexts/ToastContext';
import type { MaintenanceTask, TaskFilters } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import {
  handleApiResponse,
  readApiResponseEnvelope,
} from '@/utils/handleApiResponse';
import { errorHandler } from '@/utils/errorHandler';
import type { AppError } from '@/types/errors';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import {
  buildMaintenanceTaskQuery,
  type MaintenanceTaskQuery,
} from '@/types/api/maintenanceTasks';
import { isCalendarPlacementInRange } from '@/utils/calendar';
import { parseYMDLocal, todayLocalYMD } from '@/utils/dateParsing';

interface UseMaintenanceTasksOptions {
  initialFilters?: TaskFilters;
  autoFetch?: boolean;
}

interface UseMaintenanceTasksReturn {
  tasks: MaintenanceTask[];
  notificationTasks: MaintenanceTask[];
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
  refreshNotificationTasks: () => Promise<MaintenanceTask[]>;
}

const MAINTENANCE_TASKS_CACHE_TTL_MS = 30_000;
const CALENDAR_RANGE_PAGE_SIZE = 500;
const DEFAULT_NOTIFICATION_UPCOMING_DAYS = 3;

export class MaintenanceTasksRangeIncompleteError extends Error {
  readonly error_code = 'maintenance_tasks_range_incomplete';
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'MaintenanceTasksRangeIncompleteError';
    this.details = details;
  }
}

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

function mergeMaintenanceTasksById(
  ...taskLists: MaintenanceTask[][]
): MaintenanceTask[] {
  const merged = new Map<string, MaintenanceTask>();

  for (const tasks of taskLists) {
    for (const task of tasks) {
      merged.set(task.id, task);
    }
  }

  return Array.from(merged.values());
}

function addDaysToYMD(ymd: string, days: number): string {
  const parsed = parseYMDLocal(ymd);
  if (!parsed) return ymd;

  return format(addDays(parsed, days), 'yyyy-MM-dd');
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

type MaintenanceTaskListEnvelope = {
  data: MaintenanceTask[];
  count?: number;
  page?: number;
  pageSize?: number;
  capped?: boolean;
  complete?: boolean;
};

async function fetchMaintenanceTasksForCalendarRange(
  startDate: string,
  endDate: string,
  options?: { signal?: AbortSignal }
): Promise<MaintenanceTask[]> {
  let page = 1;
  const allTasks: MaintenanceTask[] = [];
  let totalCount = 0;
  let resolvedPageSize = CALENDAR_RANGE_PAGE_SIZE;

  while (true) {
    const queryString = buildMaintenanceTaskQuery({
      start_date: startDate,
      end_date: endDate,
      page,
      pageSize: CALENDAR_RANGE_PAGE_SIZE,
    });
    const requestUrl = `/api/maintenance-tasks${queryString}`;

    const res = options?.signal
      ? await apiFetch(requestUrl, { signal: options.signal })
      : await apiFetch(requestUrl);

    const envelope = await readApiResponseEnvelope<MaintenanceTask[]>(
      res,
      `Failed to fetch tasks by date range (${res.status})`
    );

    const payload = envelope as MaintenanceTaskListEnvelope;
    const pageTasks = Array.isArray(payload.data) ? payload.data : [];
    if (typeof payload.count === 'number') {
      totalCount = payload.count;
    } else if (page === 1) {
      totalCount = pageTasks.length;
    }
    resolvedPageSize =
      typeof payload.pageSize === 'number'
        ? payload.pageSize
        : CALENDAR_RANGE_PAGE_SIZE;

    allTasks.push(...pageTasks);

    if (pageTasks.length === 0) {
      break;
    }

    if (allTasks.length >= totalCount) {
      break;
    }

    const serverIndicatesMore =
      payload.complete === false || payload.capped === true;

    if (serverIndicatesMore || pageTasks.length >= resolvedPageSize) {
      page += 1;
      continue;
    }

    break;
  }

  if (allTasks.length < totalCount) {
    throw new MaintenanceTasksRangeIncompleteError(
      'Calendar range returned incomplete results. Additional pages are required.',
      {
        startDate,
        endDate,
        count: totalCount,
        returned: allTasks.length,
        page,
        pageSize: resolvedPageSize,
      }
    );
  }

  return allTasks;
}

function filterTasksToActiveRange(
  tasks: MaintenanceTask[],
  startDate: string,
  endDate: string
): MaintenanceTask[] {
  return tasks.filter(task =>
    isCalendarPlacementInRange(task, startDate, endDate)
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
  const [notificationTasks, setNotificationTasks] = useState<MaintenanceTask[]>(
    []
  );
  const [loading, setLoading] = useState<{ fetch: boolean; mutate: boolean }>({
    fetch: false,
    mutate: false,
  });
  const [error, setError] = useState<unknown>(null);
  const [displayError, setDisplayError] = useState<AppError | null>(null);

  const { handleError } = useErrorHandler();
  const { tenantIdentityKey } = useTenantIdentity();

  const fetchReqIdRef = useRef(0);
  const rangeFetchSeqRef = useRef(0);
  const activeCalendarRangeRef = useRef<{
    startDate: string;
    endDate: string;
  } | null>(null);
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
    setNotificationTasks([]);
    setError(null);
    setDisplayError(null);

    fetchReqIdRef.current += 1;
    rangeFetchSeqRef.current += 1;
    activeCalendarRangeRef.current = null;
    fetchCountRef.current = 0;
    mutateCountRef.current = 0;
    didFetchRef.current = false;

    setLoading({ fetch: false, mutate: false });
  }, [tenantIdentityKey]);

  const setActiveRangeTasks = useCallback((nextTasks: MaintenanceTask[]) => {
    setTasks(nextTasks);
  }, []);

  const reconcileTaskWithActiveCalendarRange = useCallback(
    (task: MaintenanceTask, previousTasks: MaintenanceTask[]) => {
      const activeRange = activeCalendarRangeRef.current;
      if (!activeRange) {
        return previousTasks
          .filter(existing => existing.id !== task.id)
          .concat(task);
      }

      const withoutTask = previousTasks.filter(
        existing => existing.id !== task.id
      );
      if (
        isCalendarPlacementInRange(
          task,
          activeRange.startDate,
          activeRange.endDate
        )
      ) {
        return [task, ...withoutTask];
      }

      return withoutTask;
    },
    []
  );

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
        setTasks(prev => reconcileTaskWithActiveCalendarRange(data, prev));

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
    [handleError, startMutate, endMutate, reconcileTaskWithActiveCalendarRange]
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
        setTasks(prev => {
          const exists = prev.some(task => task.id === id);
          const next = exists
            ? prev.map(task => (task.id === id ? data : task))
            : [...prev, data];
          const activeRange = activeCalendarRangeRef.current;
          if (!activeRange) {
            return next;
          }

          return filterTasksToActiveRange(
            next,
            activeRange.startDate,
            activeRange.endDate
          );
        });

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
      const requestSeq = ++rangeFetchSeqRef.current;
      activeCalendarRangeRef.current = { startDate, endDate };

      startFetch();
      setError(null);
      setDisplayError(null);

      try {
        if (options?.signal?.aborted) return [];

        const cacheKey = makeCacheKey(
          `range:${buildMaintenanceTaskQuery({
            start_date: startDate,
            end_date: endDate,
          })}`
        );
        const cachedTasks = getCachedMaintenanceTasks(cacheKey);

        if (cachedTasks) {
          if (
            options?.signal?.aborted ||
            tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
            requestSeq !== rangeFetchSeqRef.current
          ) {
            return [];
          }

          setActiveRangeTasks(cachedTasks);
          return cachedTasks;
        }

        const tasksResult = await fetchMaintenanceTasksForCalendarRange(
          startDate,
          endDate,
          { signal: options?.signal }
        );

        if (
          options?.signal?.aborted ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
          requestSeq !== rangeFetchSeqRef.current
        ) {
          return [];
        }

        setActiveRangeTasks(tasksResult);
        setCachedMaintenanceTasks(cacheKey, tasksResult);

        return tasksResult;
      } catch (err) {
        if (
          options?.signal?.aborted ||
          isAbortError(err) ||
          tenantIdentityKeyRef.current !== requestTenantIdentityKey ||
          requestSeq !== rangeFetchSeqRef.current
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
    [handleError, startFetch, endFetch, setActiveRangeTasks, makeCacheKey]
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
    [handleError, startFetch, endFetch, makeCacheKey]
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

  const refreshNotificationTasks = useCallback(async (): Promise<
    MaintenanceTask[]
  > => {
    const requestTenantIdentityKey = tenantIdentityKeyRef.current;
    const today = todayLocalYMD();
    const upcomingEnd = addDaysToYMD(today, DEFAULT_NOTIFICATION_UPCOMING_DAYS);
    const cacheKey = makeCacheKey(`notifications:${today}:${upcomingEnd}`);

    const cachedTasks = getCachedMaintenanceTasks(cacheKey);
    if (cachedTasks) {
      if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
        return [];
      }
      setNotificationTasks(cachedTasks);
      return cachedTasks;
    }

    try {
      const overdueQueryString = buildMaintenanceTaskQuery({ overdue: true });
      const overdueRes = await apiFetch(
        `/api/maintenance-tasks${overdueQueryString}`
      );
      const overdueTasks =
        (await handleApiResponse<MaintenanceTask[]>(
          overdueRes,
          `Failed to fetch overdue tasks for notifications (${overdueRes.status})`
        )) ?? [];

      const upcomingTasks = await fetchMaintenanceTasksForCalendarRange(
        today,
        upcomingEnd
      );

      if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
        return [];
      }

      const mergedTasks = mergeMaintenanceTasksById(
        overdueTasks,
        upcomingTasks
      );
      setNotificationTasks(mergedTasks);
      setCachedMaintenanceTasks(cacheKey, mergedTasks);

      return mergedTasks;
    } catch {
      if (tenantIdentityKeyRef.current !== requestTenantIdentityKey) {
        return [];
      }

      return [];
    }
  }, [makeCacheKey]);

  useEffect(() => {
    if (!autoFetch || didFetchRef.current) return;

    didFetchRef.current = true;
    void fetchTasks(initialFilters);
  }, [autoFetch, fetchTasks, initialFilters]);

  return {
    tasks,
    notificationTasks,
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
    refreshNotificationTasks,
  };
}
