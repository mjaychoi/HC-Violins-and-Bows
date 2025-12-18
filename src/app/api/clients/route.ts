import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest, Logger } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import type { Client } from '@/types';
import {
  validateClient,
  validateClientArray,
  validatePartialClient,
  validateCreateClient,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

async function getHandler(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const orderBy = validateSortColumn('clients', searchParams.get('orderBy'));
  const ascending = searchParams.get('ascending') !== 'false';
  const search = searchParams.get('search') || undefined;
  const all = searchParams.get('all') === 'true'; // 전체 데이터 요청 플래그
  const limitParam = searchParams.get('limit');
  const limit = limitParam
    ? parseInt(limitParam, 10)
    : all
      ? undefined // all=true면 limit 없음
      : 1000; // 기본 limit: 1000개

  try {
    const supabase = getServerSupabase();
    let query = supabase.from('clients').select('*', { count: 'exact' });

    // Add search filter if provided
    if (search && search.length >= 2) {
      // ✅ FIXED: 특수문자 이스케이프 (검색어 특수문자에서 터지는 것 방지)
      const sanitizedSearch = search.trim().replace(/[(),%]/g, ' ');
      query = query.or(
        `last_name.ilike.%${sanitizedSearch}%,first_name.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`
      );
    }

    // Add limit if provided and not requesting all data
    if (limit !== undefined && limit > 0) {
      query = query.limit(limit);
    }

    query = query.order(orderBy, { ascending });

    const { data, error, count } = await query;

    const duration = Math.round(performance.now() - startTime);

    // 디버깅: 쿼리 결과 로깅 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      interface SupabaseErrorInfo {
        message: string;
        code?: string;
        details?: string;
        hint?: string;
      }
      const errorInfo: SupabaseErrorInfo | null = error
        ? {
            message: error.message,
            code: 'code' in error ? String(error.code) : undefined,
            details: 'details' in error ? String(error.details) : undefined,
            hint: 'hint' in error ? String(error.hint) : undefined,
          }
        : null;
      Logger.debug(
        '[ClientsAPI] Raw query result',
        {
          dataLength: data?.length || 0,
          count,
          error: errorInfo,
        },
        'ClientsAPI'
      );
    }

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Fetch clients');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest('GET', '/api/clients', undefined, duration, 'ClientsAPI', {
        orderBy,
        ascending,
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });
      captureException(
        appError,
        'ClientsAPI.GET',
        { orderBy, ascending, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // 데이터가 없는 경우 경고
    if (!data || data.length === 0) {
      Logger.warn('No clients found in database', 'ClientsAPI', { count });
      if (count && count > 0) {
        Logger.warn(
          'Count is positive but data array is empty - possible RLS issue',
          'ClientsAPI',
          { count }
        );
      }
    }

    // Preprocess data: normalize tags from null to empty array
    const normalizedData = (data || []).map(
      (client: Client & { tags?: string[] | null; email?: string | null }) => ({
        ...client,
        tags:
          client.tags === null || client.tags === undefined ? [] : client.tags,
        email: client.email === null ? null : client.email || null,
      })
    );

    const recordCount = normalizedData?.length || 0;
    const totalCount = count || 0;

    // 상세 로깅: 실제 반환된 데이터 수 확인 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      Logger.debug(
        `GET /api/clients - Returning ${recordCount} clients (total: ${totalCount})`,
        {
          recordCount,
          totalCount,
        },
        'ClientsAPI'
      );
      if (recordCount === 0 && totalCount > 0) {
        Logger.warn(
          'totalCount is positive but recordCount is 0 - data may be filtered out',
          'ClientsAPI',
          {
            totalCount,
            recordCount,
          }
        );
      }
    }

    logApiRequest('GET', '/api/clients', 200, duration, 'ClientsAPI', {
      recordCount,
      totalCount,
    });

    // Validate response data
    const validationResult = safeValidate(
      normalizedData || [],
      validateClientArray
    );
    if (!validationResult.success) {
      captureException(
        new Error(`Invalid client data: ${validationResult.error}`),
        'ClientsAPI.GET',
        { duration, recordCount: normalizedData?.length || 0 },
        ErrorSeverity.HIGH
      );
      // Log warning but return data anyway (graceful degradation)
      logApiRequest('GET', '/api/clients', 200, duration, 'ClientsAPI', {
        recordCount: normalizedData?.length || 0,
        totalCount: count || 0,
        validationWarning: true,
      });
    }

    return NextResponse.json({
      data: normalizedData || [],
      count: count || 0,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Fetch clients');
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ClientsAPI.GET',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();

    // Validate request body using create schema (without id and created_at)
    const validationResult = safeValidate(body, validateCreateClient);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid client data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    // Use validated data instead of raw body
    const validatedInput = validationResult.data;

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('clients')
      .insert(validatedInput)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Create client');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest('POST', '/api/clients', undefined, duration, 'ClientsAPI', {
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });
      captureException(
        appError,
        'ClientsAPI.POST',
        { body: Object.keys(validatedInput), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedResponse = validateClient(data);

    logApiRequest('POST', '/api/clients', 201, duration, 'ClientsAPI', {
      clientId: validatedResponse.id,
    });

    return NextResponse.json({ data: validatedResponse }, { status: 201 });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Create client');
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ClientsAPI.POST',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid client ID format' },
        { status: 400 }
      );
    }

    // Validate update data using partial schema
    const validationResult = safeValidate(updates, validatePartialClient);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Update client');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'PATCH',
        '/api/clients',
        undefined,
        duration,
        'ClientsAPI',
        {
          clientId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ClientsAPI.PATCH',
        { clientId: id, updates: Object.keys(updates), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedData = validateClient(data);

    logApiRequest('PATCH', '/api/clients', 200, duration, 'ClientsAPI', {
      clientId: id,
    });

    return NextResponse.json({ data: validatedData });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Update client');
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ClientsAPI.PATCH',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Client ID is required' },
      { status: 400 }
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid client ID format' },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase.from('clients').delete().eq('id', id);

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Delete client');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'DELETE',
        '/api/clients',
        undefined,
        duration,
        'ClientsAPI',
        {
          clientId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ClientsAPI.DELETE',
        { clientId: id, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    logApiRequest('DELETE', '/api/clients', 200, duration, 'ClientsAPI', {
      clientId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Delete client');
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ClientsAPI.DELETE',
      { clientId: id, duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
