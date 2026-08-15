import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import {
  validateMaintenanceTask,
  validateMaintenanceTaskArray,
  validatePartialMaintenanceTask,
  validateCreateMaintenanceTask,
  safeValidate,
} from '@/utils/typeGuards';
import { todayLocalYMD } from '@/utils/dateParsing';
import {
  validateUUID,
  sanitizeSearchTerm,
  validateDateString,
  escapePostgrestFilterValue,
} from '@/utils/inputValidation';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { validateMaintenanceTaskStatusTransition } from '@/app/api/_utils/stateTransitions';
import {
  applyScopedRateLimit,
  destructiveMutationRateLimit,
  mutationRateLimit,
  tooManyRequestsApiResult,
} from '@/app/api/_utils/rateLimit';
import type { TablesInsert, TablesUpdate } from '@/types/database';
import type { MaintenanceTask } from '@/types';
import { getCalendarPlacementDate } from '@/utils/calendar';
import {
  MAINTENANCE_TASK_CONFLICT_MESSAGE,
  MAINTENANCE_TASK_EXPECTED_UPDATED_AT_INVALID,
  MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED,
  MAINTENANCE_TASK_STALE_VERSION,
  parseExpectedUpdatedAt,
} from '@/utils/maintenanceTaskConcurrency';
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';

type MaintenanceTaskInsertRow = TablesInsert<'maintenance_tasks'>;
type MaintenanceTaskUpdateRow = TablesUpdate<'maintenance_tasks'>;
type MaintenanceTaskSortMode =
  | 'scheduled'
  | 'overdue'
  | 'calendar_range'
  | 'default';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const MAX_SEARCH_LEN = 120;
const CALENDAR_DATE_COLUMN = 'calendar_date';

const TASK_PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const VALID_TASK_PRIORITIES = new Set(['urgent', 'high', 'medium', 'low']);

const VALID_TASK_STATUSES = new Set([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

const VALID_TASK_TYPES = new Set([
  'repair',
  'rehair',
  'maintenance',
  'inspection',
  'setup',
  'adjustment',
  'restoration',
]);

function toMaintenanceTaskInsertRow(
  input: Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at'> & {
    org_id: string;
  }
): MaintenanceTaskInsertRow {
  return input;
}

function toMaintenanceTaskUpdateRow(
  input: Partial<MaintenanceTask>
): MaintenanceTaskUpdateRow {
  const {
    instrument,
    client,
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    org_id: _orgId,
    expected_updated_at: _expectedUpdatedAt,
    ...rest
  } = input as Partial<MaintenanceTask> & {
    org_id?: string;
    expected_updated_at?: string;
  };
  void instrument;
  void client;
  void _id;
  void _createdAt;
  void _updatedAt;
  void _orgId;
  void _expectedUpdatedAt;

  return rest;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON body',
    };
  }

  if (!isObject(body)) {
    return {
      ok: false,
      error: 'Invalid request body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function sanitizeTaskSearch(search: string | undefined): string | undefined {
  if (!search) return undefined;

  const sanitized = sanitizeSearchTerm(search).trim().slice(0, MAX_SEARCH_LEN);

  return sanitized || undefined;
}

function buildTaskSearchFilter(search: string): string {
  const escaped =
    typeof escapePostgrestFilterValue === 'function'
      ? escapePostgrestFilterValue(search)
      : search;

  return [`title.ilike.%${escaped}%`, `description.ilike.%${escaped}%`].join(
    ','
  );
}

function compareNullableDateAsc(
  a: string | null | undefined,
  b: string | null | undefined
) {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function compareNullableDateDesc(
  a: string | null | undefined,
  b: string | null | undefined
) {
  return compareNullableDateAsc(b, a);
}

function sortMaintenanceTaskRows(
  tasks: MaintenanceTask[],
  sortMode: MaintenanceTaskSortMode
) {
  return [...tasks].sort((a, b) => {
    if (sortMode === 'scheduled') {
      const priorityDelta =
        (TASK_PRIORITY_RANK[b.priority] ?? 0) -
        (TASK_PRIORITY_RANK[a.priority] ?? 0);

      if (priorityDelta !== 0) return priorityDelta;

      const dueDateDelta = compareNullableDateAsc(a.due_date, b.due_date);
      if (dueDateDelta !== 0) return dueDateDelta;

      const receivedDateDelta = compareNullableDateDesc(
        a.received_date,
        b.received_date
      );
      if (receivedDateDelta !== 0) return receivedDateDelta;

      return a.id.localeCompare(b.id);
    }

    if (sortMode === 'overdue') {
      const overdueDateDelta = compareNullableDateAsc(
        a.due_date ?? a.personal_due_date,
        b.due_date ?? b.personal_due_date
      );

      if (overdueDateDelta !== 0) return overdueDateDelta;

      const receivedDateDelta = compareNullableDateDesc(
        a.received_date,
        b.received_date
      );
      if (receivedDateDelta !== 0) return receivedDateDelta;

      return a.id.localeCompare(b.id);
    }

    if (sortMode === 'calendar_range') {
      const calendarDateDelta = compareNullableDateAsc(
        a.calendar_date ?? getCalendarPlacementDate(a),
        b.calendar_date ?? getCalendarPlacementDate(b)
      );

      if (calendarDateDelta !== 0) return calendarDateDelta;

      const receivedDateDelta = compareNullableDateDesc(
        a.received_date,
        b.received_date
      );
      if (receivedDateDelta !== 0) return receivedDateDelta;

      return a.id.localeCompare(b.id);
    }

    const receivedDateDelta = compareNullableDateDesc(
      a.received_date,
      b.received_date
    );
    if (receivedDateDelta !== 0) return receivedDateDelta;

    return a.id.localeCompare(b.id);
  });
}

function isMissingMaintenanceTaskColumnError(
  error: unknown,
  column: string
): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  const code = typeof err.code === 'string' ? err.code : '';

  const haystacks = [err.message, err.details, err.hint]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.toLowerCase());

  const columnName = column.toLowerCase();
  const mentionsColumn = haystacks.some(text => text.includes(columnName));

  if (!mentionsColumn) return false;

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    haystacks.some(
      text =>
        text.includes('could not find') ||
        text.includes('does not exist') ||
        text.includes('column') ||
        text.includes('schema cache')
    )
  );
}

// GET is intentionally open to all org members (read-only calendar view).
// POST/PATCH/DELETE require admin — see those handlers below.
async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const searchParams = request.nextUrl.searchParams;

      const id = searchParams.get('id') || undefined;
      const instrumentId = searchParams.get('instrument_id') || undefined;
      const status = searchParams.get('status') || undefined;
      const taskType = searchParams.get('task_type') || undefined;
      const scheduledDate = searchParams.get('scheduled_date') || undefined;

      const startDate =
        searchParams.get('start_date') ||
        searchParams.get('startDate') ||
        undefined;

      const endDate =
        searchParams.get('end_date') ||
        searchParams.get('endDate') ||
        undefined;

      const overdue = searchParams.get('overdue') === 'true';
      const priority = searchParams.get('priority') || undefined;
      const search = sanitizeTaskSearch(
        searchParams.get('search') || undefined
      );

      const page = parsePositiveInt(searchParams.get('page'), 1, 1_000_000);

      const pageSize = parsePositiveInt(
        searchParams.get('pageSize') || searchParams.get('limit'),
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      );

      const offset = (page - 1) * pageSize;
      const to = offset + pageSize - 1;

      const sortMode: MaintenanceTaskSortMode = scheduledDate
        ? 'scheduled'
        : overdue
          ? 'overdue'
          : startDate && endDate
            ? 'calendar_range'
            : 'default';

      if (id) {
        if (!validateUUID(id)) {
          return {
            payload: { error: 'Invalid task ID format', success: false },
            status: 400,
          };
        }

        const { data, error } = await auth.userSupabase
          .from('maintenance_tasks')
          .select('*', { count: 'exact' })
          .eq('id', id)
          .eq('org_id', auth.orgId!)
          .single();

        if (error) {
          throw errorHandler.handleSupabaseError(
            error,
            'Fetch maintenance task by ID'
          );
        }

        const singleValidation = safeValidate(data, validateMaintenanceTask);
        const payloadData = singleValidation.success
          ? singleValidation.data
          : (data as MaintenanceTask);

        return {
          payload: {
            data: payloadData,
            success: true,
          },
          metadata: {
            id,
            validationWarning: !singleValidation.success,
            scope: { enforced: true, orgId: auth.orgId },
          },
        };
      }

      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrument_id format', success: false },
          status: 400,
        };
      }

      if (scheduledDate && !validateDateString(scheduledDate)) {
        return {
          payload: {
            error: 'Invalid scheduled_date format. Use YYYY-MM-DD',
            success: false,
          },
          status: 400,
        };
      }

      if ((startDate && !endDate) || (!startDate && endDate)) {
        return {
          payload: {
            error:
              'Both start_date and end_date are required for date range filtering.',
            success: false,
          },
          status: 400,
        };
      }

      if (startDate && endDate) {
        if (!validateDateString(startDate) || !validateDateString(endDate)) {
          return {
            payload: {
              error: 'Invalid date format. Use YYYY-MM-DD',
              success: false,
            },
            status: 400,
          };
        }

        if (startDate > endDate) {
          return {
            payload: {
              error: 'start_date cannot be after end_date',
              success: false,
            },
            status: 400,
          };
        }
      }

      if (status && !VALID_TASK_STATUSES.has(status)) {
        return {
          payload: { error: `Invalid status: ${status}`, success: false },
          status: 400,
        };
      }

      if (priority && !VALID_TASK_PRIORITIES.has(priority)) {
        return {
          payload: { error: `Invalid priority: ${priority}`, success: false },
          status: 400,
        };
      }

      if (taskType && !VALID_TASK_TYPES.has(taskType)) {
        return {
          payload: { error: `Invalid task_type: ${taskType}`, success: false },
          status: 400,
        };
      }

      const applyCommonFilters = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputQuery: any,
        options?: { includePersonalDueDate?: boolean }
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = inputQuery.eq('org_id', auth.orgId!);
        const includePersonalDueDate =
          options?.includePersonalDueDate !== false;

        if (instrumentId) {
          query = query.eq('instrument_id', instrumentId);
        }

        if (status) {
          query = query.eq('status', status);
        }

        if (taskType) {
          query = query.eq('task_type', taskType);
        }

        if (scheduledDate) {
          query = query.eq('scheduled_date', scheduledDate);
        }

        if (overdue) {
          const today = todayLocalYMD();

          query = query
            .in('status', ['pending', 'in_progress'])
            .or(
              includePersonalDueDate
                ? `due_date.lt.${today},personal_due_date.lt.${today}`
                : `due_date.lt.${today}`
            );
        }

        if (priority) {
          query = query.eq('priority', priority);
        }

        if (search) {
          query = query.or(buildTaskSearchFilter(search));
        }

        return query;
      };

      const applyOrdering = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputQuery: any
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = inputQuery;

        if (sortMode === 'scheduled') {
          query = query
            .order('priority', { ascending: false })
            .order('due_date', { ascending: true })
            .order('id', { ascending: true });
        } else if (sortMode === 'overdue') {
          query = query
            .order('due_date', { ascending: true })
            .order('id', { ascending: true });
        } else if (sortMode === 'calendar_range') {
          query = query
            .order('calendar_date', { ascending: true })
            .order('received_date', { ascending: false })
            .order('id', { ascending: true });
        } else {
          query = query
            .order('received_date', { ascending: false })
            .order('id', { ascending: true });
        }

        return query;
      };

      let data: MaintenanceTask[] = [];
      let count = 0;
      let capped = false;
      let complete = true;

      if (startDate && endDate) {
        const buildCalendarRangeQuery = () => {
          const baseQuery = applyOrdering(
            applyCommonFilters(
              auth.userSupabase
                .from('maintenance_tasks')
                .select('*', { count: 'exact' })
            )
          )
            .gte(CALENDAR_DATE_COLUMN, startDate)
            .lte(CALENDAR_DATE_COLUMN, endDate)
            .not(CALENDAR_DATE_COLUMN, 'is', null);

          return typeof baseQuery.range === 'function'
            ? baseQuery.range(offset, to)
            : baseQuery;
        };

        const result = await buildCalendarRangeQuery();
        const rangeError = result?.error;

        if (
          rangeError &&
          isMissingMaintenanceTaskColumnError(rangeError, CALENDAR_DATE_COLUMN)
        ) {
          return {
            payload: {
              error:
                'Calendar date column is unavailable. Apply the maintenance_tasks calendar_date migration.',
              error_code: 'maintenance_tasks_calendar_date_missing',
              success: false,
            },
            status: 503,
          };
        }

        if (rangeError) {
          throw errorHandler.handleSupabaseError(
            rangeError,
            'Fetch maintenance tasks (calendar_date range)'
          );
        }

        data = Array.isArray(result?.data)
          ? (result.data as MaintenanceTask[])
          : [];

        count = result?.count ?? data.length;
        // capped: this page is full and more rows exist (client should fetch next page).
        // complete: all rows matching the query are included in this response.
        capped = count > data.length && data.length >= pageSize;
        complete = !capped;

        data = sortMaintenanceTaskRows(data, sortMode);
      } else {
        const buildBaseQuery = (includePersonalDueDate = true) => {
          const orderedQuery = applyOrdering(
            applyCommonFilters(
              auth.userSupabase
                .from('maintenance_tasks')
                .select('*', { count: 'exact' }),
              { includePersonalDueDate }
            )
          );

          return typeof orderedQuery.range === 'function'
            ? orderedQuery.range(offset, to)
            : orderedQuery;
        };

        let result = await buildBaseQuery();
        let error = result?.error;

        if (
          error &&
          overdue &&
          isMissingMaintenanceTaskColumnError(error, 'personal_due_date')
        ) {
          result = await buildBaseQuery(false);
          error = result?.error;
        }

        if (error) {
          throw errorHandler.handleSupabaseError(
            error,
            'Fetch maintenance tasks'
          );
        }

        data = Array.isArray(result?.data)
          ? (result.data as MaintenanceTask[])
          : [];

        count = result?.count || 0;
        capped = count > data.length && data.length >= pageSize;
        complete = !capped;
      }

      const validationResult = safeValidate(
        data || [],
        validateMaintenanceTaskArray
      );

      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: data || [],
          count: count || 0,
          page,
          pageSize,
          capped,
          complete,
          success: true,
        },
        metadata: {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          page,
          pageSize,
          capped,
          complete,
          instrumentId,
          status,
          taskType,
          scheduledDate,
          startDate,
          endDate,
          overdue,
          priority,
          search,
          validationWarning,
          scope: { enforced: true, orgId: auth.orgId },
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'POST',
        routeKey: 'maintenance-tasks',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const validationResult = safeValidate(
        bodyResult.body,
        validateCreateMaintenanceTask
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid maintenance task data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      const validatedInput = validationResult.data;

      const idempotency = await claimCreateIdempotency(
        request,
        auth,
        'POST:/api/maintenance-tasks',
        createRequestHash(validatedInput)
      );

      if (idempotency.kind === 'replay') {
        return { payload: idempotency.payload, status: 200 };
      }

      if (idempotency.kind === 'conflict') {
        return { payload: idempotency.payload, status: idempotency.status };
      }

      const idempotencyKey =
        idempotency.kind === 'claimed' ? idempotency.idempotencyKey : null;

      const { data, error } = await auth.userSupabase
        .from('maintenance_tasks')
        .insert(
          toMaintenanceTaskInsertRow({ ...validatedInput, org_id: auth.orgId! })
        )
        .select()
        .single();

      if (error) {
        await clearCreateIdempotency(
          auth,
          'POST:/api/maintenance-tasks',
          idempotencyKey
        );

        throw errorHandler.handleSupabaseError(
          error,
          'Create maintenance task'
        );
      }

      const createdValidation = safeValidate(data, validateMaintenanceTask);

      if (!createdValidation.success) {
        await clearCreateIdempotency(
          auth,
          'POST:/api/maintenance-tasks',
          idempotencyKey
        );

        return {
          status: 422,
          payload: {
            error: 'Created maintenance task failed response validation',
            error_code: 'maintenance_task_response_invalid',
            details: createdValidation.error,
            success: false,
          },
        };
      }

      const createdPayload = createdValidation.data;
      const payload = {
        data: createdPayload,
        success: true,
      };

      await completeCreateIdempotency(
        auth,
        'POST:/api/maintenance-tasks',
        idempotencyKey,
        payload
      );

      return {
        payload,
        status: 201,
        metadata: {
          taskId: createdPayload.id,
        },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'PATCH',
        routeKey: 'maintenance-tasks',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const {
        id,
        expected_updated_at: expectedUpdatedAtRaw,
        ...updates
      } = bodyResult.body;

      if (typeof id !== 'string' || !id.trim()) {
        return {
          payload: { error: 'Task ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid task ID format', success: false },
          status: 400,
        };
      }

      const expectedUpdatedAtResult =
        parseExpectedUpdatedAt(expectedUpdatedAtRaw);

      if (!expectedUpdatedAtResult.ok) {
        if (expectedUpdatedAtResult.reason === 'missing') {
          return {
            payload: {
              error: 'expected_updated_at is required',
              error_code: MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED,
              success: false,
            },
            status: 400,
          };
        }

        return {
          payload: {
            error: 'expected_updated_at must be a valid timestamp',
            error_code: MAINTENANCE_TASK_EXPECTED_UPDATED_AT_INVALID,
            success: false,
          },
          status: 400,
        };
      }

      const expectedUpdatedAt = expectedUpdatedAtResult.value;

      const validationResult = safeValidate(
        updates,
        validatePartialMaintenanceTask
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid update data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      if (Object.keys(validationResult.data).length === 0) {
        return {
          payload: { error: 'No valid fields to update', success: false },
          status: 400,
        };
      }

      if (validationResult.data.status !== undefined) {
        const { data: currentTask, error: currentTaskError } =
          await auth.userSupabase
            .from('maintenance_tasks')
            .select('status')
            .eq('id', id)
            .eq('org_id', auth.orgId!)
            .single();

        if (currentTaskError || !currentTask) {
          throw errorHandler.handleSupabaseError(
            currentTaskError,
            'Fetch maintenance task status'
          );
        }

        const transitionError = validateMaintenanceTaskStatusTransition(
          currentTask.status as MaintenanceTask['status'],
          validationResult.data.status as MaintenanceTask['status']
        );

        if (transitionError) {
          return {
            payload: { error: transitionError, success: false },
            status: 409,
          };
        }
      }

      const updateRow = toMaintenanceTaskUpdateRow(validationResult.data);

      const { data: updatedRows, error } = await auth.userSupabase
        .from('maintenance_tasks')
        .update(updateRow)
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .eq('updated_at', expectedUpdatedAt)
        .select();

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Update maintenance task'
        );
      }

      if (!updatedRows?.length) {
        const { data: existingTask } = await auth.userSupabase
          .from('maintenance_tasks')
          .select('id')
          .eq('id', id)
          .eq('org_id', auth.orgId!)
          .maybeSingle();

        if (!existingTask) {
          return {
            payload: { error: 'Task not found', success: false },
            status: 404,
            metadata: { taskId: id },
          };
        }

        return {
          payload: {
            error: MAINTENANCE_TASK_CONFLICT_MESSAGE,
            error_code: MAINTENANCE_TASK_STALE_VERSION,
            success: false,
          },
          status: 409,
          metadata: { taskId: id },
        };
      }

      const data = updatedRows[0];

      const updatedValidation = safeValidate(data, validateMaintenanceTask);

      if (!updatedValidation.success) {
        return {
          status: 422,
          payload: {
            error: 'Updated maintenance task failed response validation',
            error_code: 'maintenance_task_response_invalid',
            details: updatedValidation.error,
            success: false,
          },
        };
      }

      const updatedPayload = updatedValidation.data;

      return {
        payload: {
          data: updatedPayload,
          success: true,
        },
        metadata: {
          taskId: id,
        },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const id = searchParams.get('id');

      if (!id) {
        return {
          payload: { error: 'Task ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid task ID format', success: false },
          status: 400,
        };
      }

      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const rateLimit = await applyScopedRateLimit(
        destructiveMutationRateLimit,
        {
          orgId: auth.orgId,
          userId: auth.user.id,
          method: 'DELETE',
          routeKey: 'maintenance-tasks',
          ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
        }
      );
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const { error, count } = await auth.userSupabase
        .from('maintenance_tasks')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('org_id', auth.orgId!);

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Delete maintenance task'
        );
      }

      if (!count || count === 0) {
        return {
          payload: { error: 'Task not found', success: false },
          status: 404,
          metadata: { taskId: id },
        };
      }

      return {
        payload: { success: true },
        metadata: { taskId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
