import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import {
  validateInstrument,
  validateInstrumentArray,
  validatePartialInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

async function getHandler(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const orderBy = validateSortColumn(
    'instruments',
    searchParams.get('orderBy')
  );
  const ascending = searchParams.get('ascending') !== 'false';
  const ownership = searchParams.get('ownership') || undefined;
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
    let query = supabase.from('instruments').select('*', { count: 'exact' });

    // Add ownership filter if provided
    if (ownership) {
      query = query.eq('ownership', ownership);
    }

    // Add search filter if provided
    if (search && search.length >= 2) {
      // ✅ FIXED: 특수문자 이스케이프 (검색어 특수문자에서 터지는 것 방지)
      const sanitizedSearch = search.trim().replace(/[(),%]/g, ' ');
      query = query.or(
        `maker.ilike.%${sanitizedSearch}%,type.ilike.%${sanitizedSearch}%,subtype.ilike.%${sanitizedSearch}%,serial_number.ilike.%${sanitizedSearch}%`
      );
    }

    // Add limit if provided and not requesting all data
    if (limit !== undefined && limit > 0) {
      query = query.limit(limit);
    }

    query = query.order(orderBy, { ascending });

    const { data, error, count } = await query;

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Fetch instruments'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'GET',
        '/api/instruments',
        undefined,
        duration,
        'InstrumentsAPI',
        {
          orderBy,
          ascending,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'InstrumentsAPI.GET',
        { orderBy, ascending, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validationResult = safeValidate(data || [], validateInstrumentArray);
    if (!validationResult.success) {
      captureException(
        new Error(`Invalid instrument data: ${validationResult.error}`),
        'InstrumentsAPI.GET',
        { duration, recordCount: data?.length || 0 },
        ErrorSeverity.HIGH
      );
      logApiRequest(
        'GET',
        '/api/instruments',
        200,
        duration,
        'InstrumentsAPI',
        {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          validationWarning: true,
        }
      );
    }

    logApiRequest('GET', '/api/instruments', 200, duration, 'InstrumentsAPI', {
      recordCount: data?.length || 0,
      totalCount: count || 0,
    });

    return NextResponse.json({
      data: data || [],
      count: count || 0,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Fetch instruments'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'InstrumentsAPI.GET',
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
    const validationResult = safeValidate(body, validateCreateInstrument);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid instrument data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    // Use validated data instead of raw body
    const validatedInput = validationResult.data;

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('instruments')
      .insert(validatedInput)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Create instrument'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'POST',
        '/api/instruments',
        undefined,
        duration,
        'InstrumentsAPI',
        {
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'InstrumentsAPI.POST',
        { body: Object.keys(validatedInput), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedResponse = validateInstrument(data);

    logApiRequest('POST', '/api/instruments', 201, duration, 'InstrumentsAPI', {
      instrumentId: validatedResponse.id,
    });

    return NextResponse.json({ data: validatedResponse }, { status: 201 });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Create instrument'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'InstrumentsAPI.POST',
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
        { error: 'Instrument ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    // Validate update data using partial schema
    const validationResult = safeValidate(updates, validatePartialInstrument);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('instruments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Update instrument'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'PATCH',
        '/api/instruments',
        undefined,
        duration,
        'InstrumentsAPI',
        {
          instrumentId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'InstrumentsAPI.PATCH',
        { instrumentId: id, updates: Object.keys(updates), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedData = validateInstrument(data);

    logApiRequest(
      'PATCH',
      '/api/instruments',
      200,
      duration,
      'InstrumentsAPI',
      {
        instrumentId: id,
      }
    );

    return NextResponse.json({ data: validatedData });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Update instrument'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'InstrumentsAPI.PATCH',
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
      { error: 'Instrument ID is required' },
      { status: 400 }
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid instrument ID format' },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase.from('instruments').delete().eq('id', id);

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Delete instrument'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'DELETE',
        '/api/instruments',
        undefined,
        duration,
        'InstrumentsAPI',
        {
          instrumentId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'InstrumentsAPI.DELETE',
        { instrumentId: id, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    logApiRequest(
      'DELETE',
      '/api/instruments',
      200,
      duration,
      'InstrumentsAPI',
      {
        instrumentId: id,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Delete instrument'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'InstrumentsAPI.DELETE',
      { instrumentId: id, duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
