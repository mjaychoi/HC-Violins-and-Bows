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
import type { TablesInsert, TablesUpdate } from '@/types/database';
import type { MaintenanceTask } from '@/types';

type MaintenanceTaskInsertRow = TablesInsert<'maintenance_tasks'>;
type MaintenanceTaskUpdateRow = TablesUpdate<'maintenance_tasks'>;

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
  const { instrument, client, ...rest } = input;
  void instrument;
  void client;
  return rest;
}

type MaintenanceTaskSortMode = 'scheduled' | 'overdue' | 'default';

const DATE_RANGE_COLUMNS = [
  'received_date',
  'scheduled_date',
  'due_date',
  'personal_due_date',
] as const;
const OPTIONAL_MAINTENANCE_COLUMNS = new Set<string>(['personal_due_date']);

const TASK_PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

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

      return compareNullableDateDesc(a.received_date, b.received_date);
    }

    if (sortMode === 'overdue') {
      const overdueDateDelta = compareNullableDateAsc(
        a.due_date ?? a.personal_due_date,
        b.due_date ?? b.personal_due_date
      );
      if (overdueDateDelta !== 0) return overdueDateDelta;

      return compareNullableDateDesc(a.received_date, b.received_date);
    }

    return compareNullableDateDesc(a.received_date, b.received_date);
  });
}

function organizationIdInvalidResponse() {
  return {
    payload: {
      error: 'Invalid organization context',
      message:
        'Organization id in your session is invalid. Please sign out and sign in again.',
    },
    status: 403,
  };
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      if (!validateUUID(auth.orgId!)) {
        return organizationIdInvalidResponse();
      }

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
      const search = searchParams.get('search') || undefined;
      const sortMode: MaintenanceTaskSortMode = scheduledDate
        ? 'scheduled'
        : overdue
          ? 'overdue'
          : 'default';

      // 특정 ID로 조회
      if (id) {
        // Validate UUID format for consistency with other endpoints
        if (!validateUUID(id)) {
          return {
            payload: { error: 'Invalid task ID format' },
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
          payload: { data: payloadData },
          metadata: {
            id,
            validationWarning: !singleValidation.success,
          },
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
          const sanitizedSearch = sanitizeSearchTerm(search);
          if (sanitizedSearch) {
            query = query.or(
              `title.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`
            );
          }
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
            .order('due_date', { ascending: true });
        } else if (sortMode === 'overdue') {
          query = query.order('due_date', { ascending: true });
        } else {
          query = query.order('received_date', { ascending: false });
        }

        return query;
      };

      // Validate UUID format for instrumentId (consistent with other APIs)
      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrument_id format' },
          status: 400,
        };
      }

      if (scheduledDate && !validateDateString(scheduledDate)) {
        return {
          payload: { error: 'Invalid scheduled_date format. Use YYYY-MM-DD' },
          status: 400,
        };
      }

      let data: MaintenanceTask[] = [];
      let count = 0;

      if (startDate && endDate) {
        if (!validateDateString(startDate) || !validateDateString(endDate)) {
          return {
            payload: { error: 'Invalid date format. Use YYYY-MM-DD' },
            status: 400,
          };
        }

        const rangeResults = await Promise.all(
          DATE_RANGE_COLUMNS.map(async column => {
            const rangeQuery = applyCommonFilters(
              auth.userSupabase.from('maintenance_tasks').select('*')
            )
              .gte(column, startDate)
              .lte(column, endDate);

            const { data: rangeData, error: rangeError } = await rangeQuery;

            if (rangeError) {
              if (
                OPTIONAL_MAINTENANCE_COLUMNS.has(column) &&
                isMissingMaintenanceTaskColumnError(rangeError, column)
              ) {
                return [];
              }

              throw errorHandler.handleSupabaseError(
                rangeError,
                `Fetch maintenance tasks (${column} range)`
              );
            }

            return Array.isArray(rangeData)
              ? (rangeData as MaintenanceTask[])
              : [];
          })
        );

        const mergedTasks = new Map<string, MaintenanceTask>();
        for (const rows of rangeResults) {
          for (const task of rows) {
            mergedTasks.set(task.id, task);
          }
        }

        data = sortMaintenanceTaskRows(
          Array.from(mergedTasks.values()),
          sortMode
        );
        count = data.length;
      } else {
        const buildBaseQuery = (includePersonalDueDate = true) =>
          applyOrdering(
            applyCommonFilters(
              auth.userSupabase
                .from('maintenance_tasks')
                .select('*', { count: 'exact' }),
              { includePersonalDueDate }
            )
          );

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
      }

      // Validate response data
      const validationResult = safeValidate(
        data || [],
        validateMaintenanceTaskArray
      );
      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: data || [],
          count: count || 0,
        },
        metadata: {
          recordCount: data?.length || 0,
          totalCount: count || 0,
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      if (!validateUUID(auth.orgId!)) {
        return organizationIdInvalidResponse();
      }

      const body = await request.json();

      // Validate request body using create schema (without id, created_at, updated_at)
      const validationResult = safeValidate(
        body,
        validateCreateMaintenanceTask
      );
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid maintenance task data: ${validationResult.error}`,
          },
          status: 400,
        };
      }

      // Use validated data instead of raw body
      const validatedInput = validationResult.data;

      const { data, error } = await auth.userSupabase
        .from('maintenance_tasks')
        .insert(
          toMaintenanceTaskInsertRow({ ...validatedInput, org_id: auth.orgId! })
        )
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Create maintenance task'
        );
      }

      const createdValidation = safeValidate(data, validateMaintenanceTask);
      const createdPayload = createdValidation.success
        ? createdValidation.data
        : (data as MaintenanceTask);

      return {
        payload: { data: createdPayload },
        status: 201,
        metadata: {
          taskId: createdPayload.id,
          validationWarning: !createdValidation.success,
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      if (!validateUUID(auth.orgId!)) {
        return organizationIdInvalidResponse();
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const body = await request.json();
      const { id, ...updates } = body;

      if (!id) {
        return {
          payload: { error: 'Task ID is required' },
          status: 400,
        };
      }

      // Validate UUID format
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid task ID format' },
          status: 400,
        };
      }

      // Validate update data using partial schema
      const validationResult = safeValidate(
        updates,
        validatePartialMaintenanceTask
      );
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
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
            payload: { error: transitionError },
            status: 409,
          };
        }
      }

      const { data, error } = await auth.userSupabase
        .from('maintenance_tasks')
        .update(toMaintenanceTaskUpdateRow(validationResult.data))
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Update maintenance task'
        );
      }

      const updatedValidation = safeValidate(data, validateMaintenanceTask);
      const updatedPayload = updatedValidation.success
        ? updatedValidation.data
        : (data as MaintenanceTask);

      return {
        payload: { data: updatedPayload },
        metadata: {
          taskId: id,
          validationWarning: !updatedValidation.success,
        },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'MaintenanceTasksAPI',
        context: 'MaintenanceTasksAPI',
      },
      async () => ({
        payload: { error: 'Task ID is required' },
        status: 400,
      })
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'MaintenanceTasksAPI',
        context: 'MaintenanceTasksAPI',
      },
      async () => ({
        payload: { error: 'Invalid task ID format' },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
      metadata: { taskId: id },
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      if (!validateUUID(auth.orgId!)) {
        return organizationIdInvalidResponse();
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
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
          payload: { error: 'Task not found' },
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
