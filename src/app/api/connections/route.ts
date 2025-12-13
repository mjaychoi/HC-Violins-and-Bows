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
  validateClientInstrument,
  validateCreateClientInstrument,
  validatePartialClientInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const clientId = searchParams.get('client_id') || undefined;
  const instrumentId = searchParams.get('instrument_id') || undefined;
  const orderBy = validateSortColumn(
    'connections',
    searchParams.get('orderBy')
  );
  const ascending = searchParams.get('ascending') !== 'false';

  // Pagination parameters
  const page = searchParams.get('page')
    ? Math.max(1, parseInt(searchParams.get('page')!, 10))
    : undefined;
  const pageSize = searchParams.get('pageSize')
    ? Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize')!, 10)))
    : undefined;

  try {
    const supabase = getServerSupabase();
    let query = supabase.from('client_instruments').select(
      `
          *,
          client:clients(*),
          instrument:instruments(*)
        `,
      { count: 'exact' }
    );

    if (clientId) {
      if (!validateUUID(clientId)) {
        return NextResponse.json(
          { error: 'Invalid client_id format' },
          { status: 400 }
        );
      }
      query = query.eq('client_id', clientId);
    }

    if (instrumentId) {
      if (!validateUUID(instrumentId)) {
        return NextResponse.json(
          { error: 'Invalid instrument_id format' },
          { status: 400 }
        );
      }
      query = query.eq('instrument_id', instrumentId);
    }

    query = query.order(orderBy, { ascending });

    // Apply pagination if provided
    if (page && pageSize) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Fetch connections'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'GET',
        '/api/connections',
        undefined,
        duration,
        'ConnectionsAPI',
        {
          clientId,
          instrumentId,
          orderBy,
          ascending,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ConnectionsAPI.GET',
        { clientId, instrumentId, orderBy, ascending, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data (optional validation for arrays with relations)
    // Note: ClientInstrument with relations may need custom validation
    logApiRequest('GET', '/api/connections', 200, duration, 'ConnectionsAPI', {
      recordCount: data?.length || 0,
      totalCount: count || 0,
      page,
      pageSize,
    });

    return NextResponse.json({
      data: data || [],
      count: count || 0,
      page,
      pageSize,
      totalPages:
        page && pageSize && count ? Math.ceil(count / pageSize) : undefined,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Fetch connections'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ConnectionsAPI.GET',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();

    // Validate request body using Zod schema
    const validationResult = safeValidate(body, validateCreateClientInstrument);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid connection data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    // Use validated data instead of raw body
    const validatedInput = validationResult.data;

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('client_instruments')
      .insert(validatedInput)
      .select(
        `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
      )
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Create connection'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'POST',
        '/api/connections',
        undefined,
        duration,
        'ConnectionsAPI',
        {
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ConnectionsAPI.POST',
        { body: Object.keys(validatedInput), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data (with relations)
    const validatedResponse = validateClientInstrument(data);

    logApiRequest('POST', '/api/connections', 201, duration, 'ConnectionsAPI', {
      connectionId: validatedResponse.id,
    });

    return NextResponse.json({ data: validatedResponse }, { status: 201 });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Create connection'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ConnectionsAPI.POST',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const startTime = performance.now();
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid connection ID format' },
        { status: 400 }
      );
    }

    // Validate update data using partial schema
    const validationResult = safeValidate(
      updates,
      validatePartialClientInstrument
    );
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('client_instruments')
      .update(updates)
      .eq('id', id)
      .select(
        `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
      )
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Update connection'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'PATCH',
        '/api/connections',
        undefined,
        duration,
        'ConnectionsAPI',
        {
          connectionId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ConnectionsAPI.PATCH',
        { connectionId: id, updates: Object.keys(updates), duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data (with relations)
    const validatedData = validateClientInstrument(data);

    logApiRequest(
      'PATCH',
      '/api/connections',
      200,
      duration,
      'ConnectionsAPI',
      {
        connectionId: id,
      }
    );

    return NextResponse.json({ data: validatedData });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Update connection'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ConnectionsAPI.PATCH',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Connection ID is required' },
      { status: 400 }
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid connection ID format' },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase
      .from('client_instruments')
      .delete()
      .eq('id', id);

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Delete connection'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'DELETE',
        '/api/connections',
        undefined,
        duration,
        'ConnectionsAPI',
        {
          connectionId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'ConnectionsAPI.DELETE',
        { connectionId: id, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    logApiRequest(
      'DELETE',
      '/api/connections',
      200,
      duration,
      'ConnectionsAPI',
      {
        connectionId: id,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Delete connection'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'ConnectionsAPI.DELETE',
      { connectionId: id, duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
