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
  const { instrument: _instrument, client: _client, ...rest } = input;
  return rest;
}

type MaintenanceTaskSortMode = 'scheduled' | 'overdue' | 'default';

const DATE_RANGE_COLUMNS = [
  'received_date',
  'scheduled_date',
  'due_date',
  'personal_due_date',
] as const;

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

        // Validate response data
        const validatedData = validateMaintenanceTask(data);

        return {
          payload: { data: validatedData },
          metadata: { id },
        };
      }

      const applyCommonFilters = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputQuery: any
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = inputQuery.eq('org_id', auth.orgId!);

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
            .or(`due_date.lt.${today},personal_due_date.lt.${today}`);
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
        const query = applyOrdering(
          applyCommonFilters(
            auth.userSupabase
              .from('maintenance_tasks')
              .select('*', { count: 'exact' })
          )
        );

        const result = await query;
        const error = result?.error;

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

      // Validate response data
      const validatedResponse = validateMaintenanceTask(data);

      return {
        payload: { data: validatedResponse },
        status: 201,
        metadata: { taskId: validatedResponse.id },
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

      // Validate response data
      const validatedData = validateMaintenanceTask(data);

      return {
        payload: { data: validatedData },
        metadata: { taskId: id },
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
