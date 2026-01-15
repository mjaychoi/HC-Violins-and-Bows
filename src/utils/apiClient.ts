import { errorHandler } from './errorHandler';
import { getSupabaseClient } from '@/lib/supabase-client';
import { logApiRequest, logError } from './logger';
import { captureException } from './monitoring';
import { ErrorSeverity } from '@/types/errors';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';

import type { PostgrestError } from '@supabase/postgrest-js';
import {
  validateSortColumn,
  validateFilterColumn,
  ALLOWED_SORT_COLUMNS,
} from './inputValidation';
import type { Database } from '@/types/database';

const nowMs = (): number =>
  typeof globalThis !== 'undefined' && globalThis.performance?.now
    ? globalThis.performance.now()
    : Date.now();

export type AppError = ReturnType<typeof errorHandler.handleSupabaseError>;
export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: AppError };

export type TableName =
  | 'clients'
  | 'instruments'
  | 'connections'
  | 'maintenance_tasks'
  | 'sales_history';

type DbTableName = keyof Database['public']['Tables'];

export const TABLE_TO_DB = {
  clients: 'clients',
  instruments: 'instruments',
  connections: 'client_instruments',
  maintenance_tasks: 'maintenance_tasks',
  sales_history: 'sales_history',
} as const satisfies Record<TableName, DbTableName>;

type AllowedTables = keyof typeof ALLOWED_SORT_COLUMNS;
type DbTableOf<K extends TableName> = (typeof TABLE_TO_DB)[K];
type DbTableInfo<K extends TableName> =
  Database['public']['Tables'][DbTableOf<K>];

export type AllowedColumn<K extends AllowedTables> =
  (typeof ALLOWED_SORT_COLUMNS)[K][number] & string;

export type TableRowMap = {
  [K in TableName]: DbTableInfo<K>['Row'];
};

type EqValue<K extends TableName> = TableRowMap[K][AllowedColumn<
  K & AllowedTables
> &
  keyof TableRowMap[K]];

export type QueryFilter<K extends TableName> = {
  column: AllowedColumn<K & AllowedTables>;
  value: EqValue<K>;
};

export type QueryOptions<K extends TableName> = {
  select?: string;
  eq?: QueryFilter<K>;
  order?: { column: AllowedColumn<K & AllowedTables>; ascending?: boolean };
  limit?: number;
  offset?: number;
};

export class ApiClient {
  private static instance: ApiClient;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) ApiClient.instance = new ApiClient();
    return ApiClient.instance;
  }

  private getDbTable<K extends TableName>(table: K): DbTableName {
    return TABLE_TO_DB[table];
  }

  private handleQueryError(
    operation: string,
    table: TableName,
    duration: number,
    error: unknown,
    url: string,
    extra?: Record<string, unknown>
  ): ApiResult<never> {
    const appError = errorHandler.handleSupabaseError(
      error,
      `${operation} ${table}`
    );
    logApiRequest('GET', url, undefined, duration, 'ApiClient', {
      table,
      operation,
      error: true,
      errorCode: (appError as { code?: string })?.code,
      ...extra,
    });
    captureException(
      appError,
      `ApiClient.${operation}(${table})`,
      { table, operation, duration, originalError: error },
      ErrorSeverity.MEDIUM
    );
    return { data: null, error: appError };
  }

  async query<K extends TableName>(
    table: K,
    options?: QueryOptions<K>
  ): Promise<ApiResult<TableRowMap[K][]>> {
    const startTime = nowMs();
    const url = `supabase://${String(table)}`;

    try {
      const supabase = await getSupabaseClient();
      const dbTable = this.getDbTable(table) as DbTableOf<K>;
      let q = supabase
        .from<DbTableOf<K>, DbTableInfo<K>>(dbTable)
        .select(options?.select ?? '*');

      if (options?.eq) {
        const safeColumn = validateFilterColumn(
          table as K & AllowedTables,
          options.eq.column
        ) as AllowedColumn<K & AllowedTables>;
        const columnKey = safeColumn as Extract<
          keyof DbTableInfo<K>['Row'],
          string
        >;
        const value = options.eq
          .value as DbTableInfo<K>['Row'][typeof columnKey];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (q as any).eq(columnKey, value);
      }

      if (options?.order) {
        const safeColumn = validateSortColumn(
          table as K & AllowedTables,
          options.order.column ?? null
        );
        q = q.order(safeColumn, { ascending: options.order.ascending ?? true });
      }

      const hasLimit = typeof options?.limit === 'number';
      const hasOffset = typeof options?.offset === 'number';

      if (hasLimit || hasOffset) {
        const limit = options?.limit ?? 1000;
        const offset = options?.offset ?? 0;
        if (hasLimit) {
          q = q.limit(limit);
        }
        if (limit === 0) {
          const duration = Math.round(nowMs() - startTime);
          logApiRequest('GET', url, 200, duration, 'ApiClient', {
            table,
            operation: 'query',
            recordCount: 0,
            note: 'limit=0 short-circuit',
          });
          return { data: [], error: null };
        }
        q = q.range(offset, offset + limit - 1);
      }

      const result = (await q) as {
        data: TableRowMap[K][] | null;
        error: PostgrestError | null;
      };
      const { data, error } = result;
      const duration = Math.round(nowMs() - startTime);

      if (error) {
        return this.handleQueryError('query', table, duration, error, url);
      }

      const recordCount = Array.isArray(data) ? data.length : 0;
      logApiRequest('GET', url, 200, duration, 'ApiClient', {
        table,
        operation: 'query',
        recordCount,
      });
      const normalized = Array.isArray(data) ? (data as TableRowMap[K][]) : [];
      return { data: normalized, error: null };
    } catch (err) {
      const duration = Math.round(nowMs() - startTime);
      const appError = errorHandler.handleSupabaseError(
        err,
        `Query ${String(table)}`
      );
      logError(`Query failed: ${String(table)}`, err, 'ApiClient', {
        table,
        operation: 'query',
        duration,
      });
      captureException(
        appError,
        `ApiClient.query(${String(table)})`,
        { table, operation: 'query', duration, originalError: err },
        ErrorSeverity.HIGH
      );
      return { data: null, error: appError };
    }
  }

  private logAndCapture(
    method: 'create' | 'update' | 'delete',
    table: TableName,
    duration: number,
    error: AppError | null,
    payload?: { recordId?: string }
  ) {
    logApiRequest(
      method === 'create' ? 'POST' : method === 'update' ? 'PUT' : 'DELETE',
      `supabase://${table}/${method}`,
      error
        ? undefined
        : method === 'delete'
          ? payload?.recordId
            ? 200
            : undefined
          : 200,
      duration,
      'ApiClient',
      {
        table,
        operation: method,
        recordId: payload?.recordId,
        error: Boolean(error),
        errorCode: (error as { code?: string })?.code,
      }
    );
  }

  private captureAndHandle(
    method: 'create' | 'update' | 'delete',
    table: TableName,
    duration: number,
    error: unknown,
    context: Record<string, unknown>
  ): AppError {
    const appError = errorHandler.handleSupabaseError(
      error,
      `${method} ${table}`
    );
    captureException(
      appError,
      `ApiClient.${method}(${table})`,
      { table, operation: method, duration, ...context },
      ErrorSeverity.MEDIUM
    );
    return appError;
  }

  async create<K extends TableName>(
    table: K,
    payload: DbTableInfo<K>['Insert']
  ): Promise<ApiResult<TableRowMap[K]>> {
    const startTime = nowMs();
    try {
      const supabase = await getSupabaseClient();
      const dbTable = this.getDbTable(table) as DbTableOf<K>;
      const response = (await supabase
        .from(dbTable)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert([payload as any])
        .select()
        .single()) as {
        data: DbTableInfo<K>['Row'] | null;
        error: PostgrestError | null;
      };
      const { data, error } = response;
      const duration = Math.round(nowMs() - startTime);

      if (error || !data) {
        const appError = this.captureAndHandle(
          'create',
          table,
          duration,
          error ?? new Error('Create operation failed'),
          {
            originalError: error,
          }
        );
        this.logAndCapture('create', table, duration, appError);
        return { data: null, error: appError };
      }

      const normalized = data as TableRowMap[K];
      this.logAndCapture('create', table, duration, null, {
        recordId: normalized?.id,
      });
      return { data: normalized, error: null };
    } catch (err) {
      const duration = Math.round(nowMs() - startTime);
      const appError = this.captureAndHandle(
        'create',
        table,
        duration,
        err,
        {}
      );
      this.logAndCapture('create', table, duration, appError);
      logError(`Create failed: ${String(table)}`, err, 'ApiClient', {
        table,
        operation: 'create',
        duration,
      });
      return { data: null, error: appError };
    }
  }

  async update<K extends TableName>(
    table: K,
    id: string,
    payload: DbTableInfo<K>['Update']
  ): Promise<ApiResult<TableRowMap[K]>> {
    const startTime = nowMs();

    try {
      const supabase = await getSupabaseClient();
      const dbTable = this.getDbTable(table) as DbTableOf<K>;

      const response: PostgrestSingleResponse<DbTableInfo<K>['Row']> =
        await supabase
          .from(dbTable)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(payload as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('id' as any, id as any)
          .select()
          .single();

      const { data, error } = response;
      const duration = Math.round(nowMs() - startTime);

      if (error || !data) {
        const appError = this.captureAndHandle(
          'update',
          table,
          duration,
          error ?? new Error('Update operation failed'),
          { originalError: error }
        );
        this.logAndCapture('update', table, duration, appError);
        return { data: null, error: appError };
      }

      const normalized = data as TableRowMap[K];
      this.logAndCapture('update', table, duration, null, {
        recordId: normalized?.id,
      });
      return { data: normalized, error: null };
    } catch (err: unknown) {
      const duration = Math.round(nowMs() - startTime);
      const appError = this.captureAndHandle('update', table, duration, err, {
        id,
      });
      this.logAndCapture('update', table, duration, appError);
      logError(`Update failed: ${String(table)}`, err, 'ApiClient', {
        table,
        operation: 'update',
        duration,
      });
      return { data: null, error: appError };
    }
  }

  async delete<K extends TableName>(
    table: K,
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const startTime = nowMs();
    try {
      const supabase = await getSupabaseClient();
      const dbTable = this.getDbTable(table) as DbTableOf<K>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder = supabase.from(dbTable) as any;
      const response = (await builder
        .delete()
        .eq('id', id)
        .select('id')
        .single()) as {
        data: DbTableInfo<K>['Row'] | null;
        error: PostgrestError | null;
      };
      const { data, error } = response;

      const duration = Math.round(nowMs() - startTime);

      if (error || !data) {
        const appError = this.captureAndHandle(
          'delete',
          table,
          duration,
          error ?? new Error('Delete operation failed'),
          {
            originalError: error,
          }
        );
        this.logAndCapture('delete', table, duration, appError);
        return { success: false, error: appError };
      }

      const recordId = (data as { id?: string })?.id;
      this.logAndCapture('delete', table, duration, null, { recordId });
      return { success: true, error: null };
    } catch (err) {
      const duration = Math.round(nowMs() - startTime);
      const appError = this.captureAndHandle('delete', table, duration, err, {
        id,
      });
      this.logAndCapture('delete', table, duration, appError);
      logError(`Delete failed: ${String(table)}`, err, 'ApiClient', {
        table,
        operation: 'delete',
        duration,
      });
      return { success: false, error: appError };
    }
  }
}

export const apiClient = ApiClient.getInstance();
