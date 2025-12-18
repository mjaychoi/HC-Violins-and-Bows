import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
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

export const GET = withAuthRoute(async function GET(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id') || undefined;
  const instrumentId = searchParams.get('instrument_id') || undefined;
  const status = searchParams.get('status') || undefined;
  const taskType = searchParams.get('task_type') || undefined;
  const scheduledDate = searchParams.get('scheduled_date') || undefined;
  const startDate = searchParams.get('start_date') || undefined;
  const endDate = searchParams.get('end_date') || undefined;
  const overdue = searchParams.get('overdue') === 'true';

  try {
    // 특정 ID로 조회
    if (id) {
      // Validate UUID format for consistency with other endpoints
      if (!validateUUID(id)) {
        return NextResponse.json(
          { error: 'Invalid task ID format' },
          { status: 400 }
        );
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*', { count: 'exact' })
        .eq('id', id)
        .single();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          'Fetch maintenance task by ID'
        );
        const logInfo = createLogErrorInfo(appError);
        logApiRequest(
          'GET',
          '/api/maintenance-tasks',
          undefined,
          duration,
          'MaintenanceTasksAPI',
          {
            id,
            error: true,
            errorCode: (appError as { code?: string })?.code,
            logMessage: logInfo.message,
          }
        );
        captureException(
          appError,
          'MaintenanceTasksAPI.GET',
          { id, duration },
          ErrorSeverity.MEDIUM
        );
        const safeError = createSafeErrorResponse(appError, 500);
        return NextResponse.json(safeError, { status: 500 });
      }

      // Validate response data
      const validatedData = validateMaintenanceTask(data);

      logApiRequest(
        'GET',
        '/api/maintenance-tasks',
        200,
        duration,
        'MaintenanceTasksAPI',
        {
          id,
        }
      );

      return NextResponse.json({ data: validatedData });
    }

    // 필터 적용
    const supabase = getServerSupabase();
    let query = supabase
      .from('maintenance_tasks')
      .select('*', { count: 'exact' });

    // Validate UUID format for instrumentId (consistent with other APIs)
    if (instrumentId) {
      if (!validateUUID(instrumentId)) {
        const duration = Math.round(performance.now() - startTime);
        logApiRequest(
          'GET',
          '/api/maintenance-tasks',
          400,
          duration,
          'MaintenanceTasksAPI',
          {
            instrumentId,
            error: true,
            errorCode: 'INVALID_UUID',
          }
        );
        return NextResponse.json(
          { error: 'Invalid instrument_id format' },
          { status: 400 }
        );
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
        const duration = Math.round(performance.now() - startTime);
        logApiRequest(
          'GET',
          '/api/maintenance-tasks',
          400,
          duration,
          'MaintenanceTasksAPI',
          {
            scheduledDate,
            error: true,
            errorCode: 'INVALID_DATE',
          }
        );
        return NextResponse.json(
          { error: 'Invalid scheduled_date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }
      query = query.eq('scheduled_date', scheduledDate);
    }
    if (startDate && endDate) {
      // Validate date strings before using in query
      if (!validateDateString(startDate) || !validateDateString(endDate)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
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
    const priority = searchParams.get('priority') || undefined;
    const search = searchParams.get('search') || undefined;

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

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Fetch maintenance tasks'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'GET',
        '/api/maintenance-tasks',
        undefined,
        duration,
        'MaintenanceTasksAPI',
        {
          instrumentId,
          status,
          taskType,
          scheduledDate,
          startDate,
          endDate,
          overdue,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'MaintenanceTasksAPI.GET',
        {
          instrumentId,
          status,
          taskType,
          scheduledDate,
          startDate,
          endDate,
          overdue,
          duration,
        },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validationResult = safeValidate(
      data || [],
      validateMaintenanceTaskArray
    );
    if (!validationResult.success) {
      captureException(
        new Error(`Invalid maintenance task data: ${validationResult.error}`),
        'MaintenanceTasksAPI.GET',
        { duration, recordCount: data?.length || 0 },
        ErrorSeverity.HIGH
      );
      logApiRequest(
        'GET',
        '/api/maintenance-tasks',
        200,
        duration,
        'MaintenanceTasksAPI',
        {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          validationWarning: true,
        }
      );
    }

    logApiRequest(
      'GET',
      '/api/maintenance-tasks',
      200,
      duration,
      'MaintenanceTasksAPI',
      {
        recordCount: data?.length || 0,
        totalCount: count || 0,
      }
    );

    return NextResponse.json({
      data: data || [],
      count: count || 0,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Fetch maintenance tasks'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'MaintenanceTasksAPI.GET',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});

export const POST = withAuthRoute(async function POST(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();

    // Validate request body using create schema (without id, created_at, updated_at)
    const validationResult = safeValidate(body, validateCreateMaintenanceTask);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid maintenance task data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    // Use validated data instead of raw body
    const validatedInput = validationResult.data;

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .insert(validatedInput)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Create maintenance task'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'POST',
        '/api/maintenance-tasks',
        undefined,
        duration,
        'MaintenanceTasksAPI',
        {
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'MaintenanceTasksAPI.POST',
        { body: Object.keys(validatedInput), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedResponse = validateMaintenanceTask(data);

    logApiRequest(
      'POST',
      '/api/maintenance-tasks',
      201,
      duration,
      'MaintenanceTasksAPI',
      {
        taskId: validatedResponse.id,
      }
    );

    return NextResponse.json({ data: validatedResponse }, { status: 201 });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Create maintenance task'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'MaintenanceTasksAPI.POST',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});

export const PATCH = withAuthRoute(async function PATCH(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid task ID format' },
        { status: 400 }
      );
    }

    // Validate update data using partial schema
    const validationResult = safeValidate(
      updates,
      validatePartialMaintenanceTask
    );
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Update maintenance task'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'PATCH',
        '/api/maintenance-tasks',
        undefined,
        duration,
        'MaintenanceTasksAPI',
        {
          taskId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'MaintenanceTasksAPI.PATCH',
        { taskId: id, updates: Object.keys(updates), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedData = validateMaintenanceTask(data);

    logApiRequest(
      'PATCH',
      '/api/maintenance-tasks',
      200,
      duration,
      'MaintenanceTasksAPI',
      {
        taskId: id,
      }
    );

    return NextResponse.json({ data: validatedData });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Update maintenance task'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'MaintenanceTasksAPI.PATCH',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});

export const DELETE = withAuthRoute(async function DELETE(
  request: NextRequest
) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid task ID format' },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase
      .from('maintenance_tasks')
      .delete()
      .eq('id', id);

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Delete maintenance task'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'DELETE',
        '/api/maintenance-tasks',
        undefined,
        duration,
        'MaintenanceTasksAPI',
        {
          taskId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'MaintenanceTasksAPI.DELETE',
        { taskId: id, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    logApiRequest(
      'DELETE',
      '/api/maintenance-tasks',
      200,
      duration,
      'MaintenanceTasksAPI',
      {
        taskId: id,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Delete maintenance task'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'MaintenanceTasksAPI.DELETE',
      { taskId: id, duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});
