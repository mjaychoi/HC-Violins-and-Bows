import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
// captureException removed - withSentryRoute handles error reporting
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
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { User } from '@supabase/supabase-js';

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const id = searchParams.get('id') || undefined;
      const instrumentId = searchParams.get('instrument_id') || undefined;
      const status = searchParams.get('status') || undefined;
      const taskType = searchParams.get('task_type') || undefined;
      const scheduledDate = searchParams.get('scheduled_date') || undefined;
      const startDate = searchParams.get('start_date') || undefined;
      const endDate = searchParams.get('end_date') || undefined;
      const overdue = searchParams.get('overdue') === 'true';
      const priority = searchParams.get('priority') || undefined;
      const search = searchParams.get('search') || undefined;

      // 특정 ID로 조회
      if (id) {
        // Validate UUID format for consistency with other endpoints
        if (!validateUUID(id)) {
          return {
            payload: { error: 'Invalid task ID format' },
            status: 400,
          };
        }

        const supabase = getServerSupabase();
        const { data, error } = await supabase
          .from('maintenance_tasks')
          .select('*', { count: 'exact' })
          .eq('id', id)
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

      // 필터 적용
      const supabase = getServerSupabase();
      let query = supabase
        .from('maintenance_tasks')
        .select('*', { count: 'exact' });

      // Validate UUID format for instrumentId (consistent with other APIs)
      if (instrumentId) {
        if (!validateUUID(instrumentId)) {
          return {
            payload: { error: 'Invalid instrument_id format' },
            status: 400,
          };
        }
        query = query.eq('instrument_id', instrumentId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (taskType) {
        query = query.eq('task_type', taskType);
      }
      // Validate scheduledDate format - return 400 instead of silently ignoring invalid dates
      if (scheduledDate) {
        if (!validateDateString(scheduledDate)) {
          return {
            payload: { error: 'Invalid scheduled_date format. Use YYYY-MM-DD' },
            status: 400,
          };
        }
        query = query.eq('scheduled_date', scheduledDate);
      }
      if (startDate && endDate) {
        // Validate date strings before using in query
        if (!validateDateString(startDate) || !validateDateString(endDate)) {
          return {
            payload: { error: 'Invalid date format. Use YYYY-MM-DD' },
            status: 400,
          };
        }

        // 날짜 범위 필터링: 여러 날짜 필드 확인 (received_date, scheduled_date, due_date)
        // Supabase의 or() + and()를 사용하여 각 필드가 범위 내에 있는 경우를 OR로 묶음
        // 의미: (received_date가 범위 내) OR (scheduled_date가 범위 내) OR (due_date가 범위 내)
        query = query.or(
          `and(received_date.gte.${startDate},received_date.lte.${endDate}),` +
            `and(scheduled_date.gte.${startDate},scheduled_date.lte.${endDate}),` +
            `and(due_date.gte.${startDate},due_date.lte.${endDate})`
        );
      }
      if (overdue) {
        // FIXED: Use todayLocalYMD for consistent date format (YYYY-MM-DD)
        const today = todayLocalYMD();
        query = query
          .in('status', ['pending', 'in_progress'])
          .or(`due_date.lt.${today},personal_due_date.lt.${today}`);
      }

      // 추가 필터 (priority, search 등은 클라이언트에서 처리하거나 별도 파라미터로 추가 가능)
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

      // 기본 정렬
      if (scheduledDate) {
        query = query
          .order('priority', { ascending: false })
          .order('due_date', { ascending: true });
      } else if (overdue) {
        query = query.order('due_date', { ascending: true });
      } else {
        query = query.order('received_date', { ascending: false });
      }

      const { data, error, count } = await query;

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Fetch maintenance tasks'
        );
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

async function postHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
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

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .insert(validatedInput)
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

async function patchHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'MaintenanceTasksAPI',
      context: 'MaintenanceTasksAPI',
    },
    async () => {
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

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update(updates)
        .eq('id', id)
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

async function deleteHandler(request: NextRequest, _user: User) {
  void _user;

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
      const supabase = getServerSupabase();
      const { error } = await supabase
        .from('maintenance_tasks')
        .delete()
        .eq('id', id);

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Delete maintenance task'
        );
      }

      return {
        payload: { success: true },
        metadata: { taskId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
