import {
  Client,
  Instrument,
  ClientInstrument,
  MaintenanceTask,
  TaskFilters,
} from '@/types';
import { apiClient } from '@/utils/apiClient';
import { getSupabaseClient } from '@/lib/supabase-client';
import { AppError, ErrorCodes } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { ALLOWED_SORT_COLUMNS } from '@/utils/inputValidation';

type CacheKey = 'clients' | 'instruments' | 'connections' | 'maintenance_tasks';
type SortDirection = 'asc' | 'desc';

// ✅ FIXED: TableName 유니언 타입 정의 (테이블명 캐스팅 개선) - 현재는 사용하지 않지만 향후 확장 가능
// type TableName = 'clients' | 'instruments' | 'client_instruments' | 'maintenance_tasks' | 'connections' | 'sales_history';

interface QueryOptions<T> {
  searchTerm?: string;
  sortBy?: keyof T;
  sortDirection?: SortDirection;
  filter?: Partial<T>;
}

interface FetchOptions {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  eq?: { column: string; value: unknown };
}

// Simple in-memory cache timestamps to coordinate invalidation.
const cacheTimestamps = new Map<CacheKey, number>();

function updateCacheTimestamp(key: CacheKey) {
  cacheTimestamps.set(key, Date.now());
}

export function invalidateCache(key: CacheKey) {
  cacheTimestamps.delete(key);
}

export function getCacheTimestamp(key: CacheKey): number | undefined {
  return cacheTimestamps.get(key);
}

function matchesFilter<T extends object>(item: T, filter?: Partial<T>) {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => {
    if (v === undefined || v === null || v === '') return true;
    return item[k as keyof T] === v;
  });
}

function matchesSearch<T extends object>(
  item: T,
  searchTerm?: string,
  fields: Array<keyof T> = []
) {
  if (!searchTerm) return true;
  const lower = searchTerm.toLowerCase();
  return fields.some(field => {
    const value = item[field];
    if (value === undefined || value === null) return false;
    return String(value).toLowerCase().includes(lower);
  });
}

/**
 * Apply sorting to items
 * Supports string and number types only (mixed types may produce unexpected results)
 *
 * @param items - Array to sort
 * @param sortBy - Field to sort by
 * @param sortDirection - Sort direction
 * @param compare - Optional custom comparison function (takes precedence over default)
 */
function applySorting<T>(
  items: T[],
  sortBy?: keyof T,
  sortDirection: SortDirection = 'asc',
  compare?: (a: unknown, b: unknown) => number
) {
  if (!sortBy) return items;

  const dir = sortDirection === 'asc' ? 1 : -1;

  // Use custom compare function if provided
  if (compare) {
    return [...items].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      return compare(av, bv) * dir;
    });
  }

  // Default comparison (handles string/number/null/undefined)
  return [...items].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];

    // Equal values
    if (av === bv) return 0;

    // ✅ FIXED: null/undefined는 항상 끝으로 (방향과 무관하게)
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // av가 null이면 끝으로
    if (bv == null) return -1; // bv가 null이면 끝으로

    // Type-specific comparison
    const avType = typeof av;
    const bvType = typeof bv;

    // Numbers: direct comparison
    if (avType === 'number' && bvType === 'number') {
      return ((av as number) - (bv as number)) * dir;
    }

    // Strings: localeCompare for proper sorting
    if (avType === 'string' && bvType === 'string') {
      return (av as string).localeCompare(bv as string) * dir;
    }

    // Mixed types: convert to string and compare
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export function applyQuery<T extends object>(
  items: T[],
  options: QueryOptions<T>,
  searchFields: Array<keyof T>
) {
  const { searchTerm, sortBy, sortDirection, filter } = options;
  const filtered = items.filter(
    item =>
      matchesFilter(item, filter) &&
      matchesSearch(item, searchTerm, searchFields)
  );
  return applySorting(filtered, sortBy, sortDirection);
}

/**
 * Fetch clients with optional client-side search/filter/sort.
 * Accepts a fetcher for dependency injection (e.g., SupabaseHelpers, REST, mocks).
 */
export async function fetchClients(
  fetcher: () => Promise<Client[]>,
  options: QueryOptions<Client> = {},
  searchFields: Array<keyof Client> = ['first_name', 'last_name', 'email']
): Promise<Client[]> {
  const clients = await fetcher();
  const result = applyQuery(clients, options, searchFields);
  updateCacheTimestamp('clients');
  return result;
}

/**
 * Fetch instruments with optional client-side search/filter/sort.
 * Accepts a fetcher for dependency injection (e.g., SupabaseHelpers, REST, mocks).
 */
export async function fetchInstruments(
  fetcher: () => Promise<Instrument[]>,
  options: QueryOptions<Instrument> = {},
  searchFields: Array<keyof Instrument> = [
    'maker',
    'type',
    'subtype',
    'serial_number',
  ]
): Promise<Instrument[]> {
  const instruments = await fetcher();
  const result = applyQuery(instruments, options, searchFields);
  updateCacheTimestamp('instruments');
  return result;
}

// ============================================================================
// 통합 데이터 서비스 레이어 - 모든 Supabase 호출을 중앙화
// ============================================================================

/**
 * 통합 데이터 서비스 클래스
 * 모든 데이터 접근을 단일 책임 층으로 통합하여:
 * - 네트워크/권한/에러 처리를 중앙화
 * - 백엔드 변경 시 일괄 대응 가능
 * - 테스트 격리 용이
 */

// ✅ FIXED: Result 타입 정의 - AppError로 normalize
// data는 null일 수 있지만, error가 있으면 data는 null이어야 함
type Result<T> =
  | { data: T | null; error: null }
  | { data: null; error: AppError };

// ✅ FIXED: unknown error를 AppError로 normalize하는 헬퍼
function toAppError(err: unknown, context?: Record<string, unknown>): AppError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    // 이미 AppError 형태인 경우
    const appErr = err as AppError;
    return {
      code: appErr.code,
      message: appErr.message,
      details: appErr.details,
      timestamp:
        typeof appErr.timestamp === 'string'
          ? appErr.timestamp
          : new Date().toISOString(),
      context: { ...appErr.context, ...context },
    };
  }

  // Supabase error 처리
  if (err && typeof err === 'object' && 'message' in err) {
    const supabaseErr = err as {
      message?: string;
      code?: string;
      details?: string;
    };
    return errorHandler.createError(
      ErrorCodes.DATABASE_ERROR,
      supabaseErr.message || 'Database error occurred',
      supabaseErr.details,
      context
    );
  }

  // 일반 Error 객체
  if (err instanceof Error) {
    return errorHandler.createError(
      ErrorCodes.UNKNOWN_ERROR,
      err.message || 'Something went wrong.',
      err.stack,
      context
    );
  }

  // 기타 unknown 타입
  return errorHandler.createError(
    ErrorCodes.UNKNOWN_ERROR,
    'Something went wrong.',
    String(err),
    context
  );
}

// ✅ FIXED: Supabase 직접 호출을 감싸는 헬퍼 (에러 처리/로그/권한 통일)
async function withSupabase<T>(
  operation: (
    supabase: Awaited<ReturnType<typeof getSupabaseClient>>
  ) => Promise<{ data: T | null; error: unknown }>,
  context?: Record<string, unknown>
): Promise<Result<T>> {
  try {
    const supabase = await getSupabaseClient();
    const result = await operation(supabase);

    if (result.error) {
      return { data: null, error: toAppError(result.error, context) };
    }

    return { data: result.data || null, error: null };
  } catch (err) {
    return { data: null, error: toAppError(err, context) };
  }
}

class DataService {
  // ============================================================================
  // Clients
  // ============================================================================

  // ✅ FIXED: Result 타입으로 변경 (AppError normalize)
  async fetchClients(options?: FetchOptions): Promise<Result<Client[]>> {
    const { data, error } = await apiClient.query<Client>('clients', {
      select: options?.select,
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      updateCacheTimestamp('clients');
    }
    return { data: data || null, error: null };
  }

  async fetchClientById(id: string): Promise<Result<Client>> {
    const { data, error } = await apiClient.query<Client>('clients', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    return { data: data?.[0] || null, error: null };
  }

  async createClient(
    clientData: Omit<Client, 'id' | 'created_at'>
  ): Promise<Result<Client>> {
    const { data, error } = await apiClient.create<Client>(
      'clients',
      clientData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('clients');
    }
    return { data: data || null, error: null };
  }

  async updateClient(
    id: string,
    clientData: Partial<Client>
  ): Promise<Result<Client>> {
    const { data, error } = await apiClient.update<Client>(
      'clients',
      id,
      clientData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('clients');
    }
    return { data: data || null, error: null };
  }

  async deleteClient(
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const { success, error } = await apiClient.delete('clients', id);
    if (success) {
      invalidateCache('clients');
      return { success: true, error: null };
    }
    return { success: false, error: (error as AppError) || null };
  }

  // ============================================================================
  // Instruments
  // ============================================================================

  async fetchInstruments(
    options?: FetchOptions
  ): Promise<Result<Instrument[]>> {
    const { data, error } = await apiClient.query<Instrument>('instruments', {
      select: options?.select,
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      updateCacheTimestamp('instruments');
    }
    return { data: data || null, error: null };
  }

  async fetchInstrumentById(id: string): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.query<Instrument>('instruments', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    return { data: data?.[0] || null, error: null };
  }

  async createInstrument(
    instrumentData: Omit<Instrument, 'id' | 'created_at'>
  ): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.create<Instrument>(
      'instruments',
      instrumentData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('instruments');
    }
    return { data: data || null, error: null };
  }

  async updateInstrument(
    id: string,
    instrumentData: Partial<Instrument>
  ): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.update<Instrument>(
      'instruments',
      id,
      instrumentData
    );
    if (!error && data) {
      invalidateCache('instruments');
      return { data, error: null };
    }
    if (error) {
      return { data: null, error: error as AppError };
    }
    return { data: null, error: null };
  }

  async deleteInstrument(
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const { success, error } = await apiClient.delete('instruments', id);
    if (success) {
      invalidateCache('instruments');
      return { success: true, error: null };
    }
    return { success: false, error: (error as AppError) || null };
  }

  // ============================================================================
  // Client-Instrument Connections
  // ============================================================================

  // ✅ FIXED: TableName 유니언 타입 사용 (캐스팅 개선)
  async fetchConnections(
    options?: FetchOptions
  ): Promise<Result<ClientInstrument[]>> {
    const { data, error } = await apiClient.query<ClientInstrument>(
      'connections' as keyof typeof ALLOWED_SORT_COLUMNS,
      {
        select:
          options?.select || '*, client:clients(*), instrument:instruments(*)',
        eq: options?.eq,
        order: options?.orderBy,
        limit: options?.limit,
      }
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      updateCacheTimestamp('connections');
    }
    return { data: data || null, error: null };
  }

  async createConnection(
    connectionData: Omit<
      ClientInstrument,
      'id' | 'created_at' | 'client' | 'instrument'
    >
  ): Promise<Result<ClientInstrument>> {
    const { data, error } = await apiClient.create<ClientInstrument>(
      'client_instruments',
      connectionData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('connections');
    }
    return { data: data || null, error: null };
  }

  async updateConnection(
    id: string,
    connectionData: Partial<ClientInstrument>
  ): Promise<Result<ClientInstrument>> {
    const { data, error } = await apiClient.update<ClientInstrument>(
      'client_instruments',
      id,
      connectionData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('connections');
    }
    return { data: data || null, error: null };
  }

  async deleteConnection(
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const { success, error } = await apiClient.delete('client_instruments', id);
    if (success) {
      invalidateCache('connections');
      return { success: true, error: null };
    }
    return { success: false, error: (error as AppError) || null };
  }

  // ============================================================================
  // Maintenance Tasks
  // ============================================================================

  /**
   * Fetch maintenance tasks with filters using server-side querying
   * ✅ FIXED: Supabase 직접 호출을 withSupabase로 감싸기 (에러 처리/로그/권한 통일)
   */
  async fetchMaintenanceTasks(
    filters?: TaskFilters
  ): Promise<Result<MaintenanceTask[]>> {
    return withSupabase(
      async supabase => {
        let query = supabase.from('maintenance_tasks').select('*');

        // Apply filters server-side
        if (filters) {
          if (filters.instrument_id) {
            query = query.eq('instrument_id', filters.instrument_id);
          }
          if (filters.status) {
            query = query.eq('status', filters.status);
          }
          if (filters.task_type) {
            query = query.eq('task_type', filters.task_type);
          }
          if (filters.priority) {
            query = query.eq('priority', filters.priority);
          }
          if (filters.date_from) {
            query = query.gte('received_date', filters.date_from);
          }
          if (filters.date_to) {
            query = query.lte('received_date', filters.date_to);
          }
          if (filters.search) {
            // ✅ FIXED: Server-side search using ilike - 특수문자 이스케이프
            const searchTerm = filters.search.trim();
            if (searchTerm) {
              // 특수문자 이스케이프 (검색어 특수문자에서 터지는 것 방지)
              const safe = searchTerm.replace(/[(),%]/g, ' ');
              query = query.or(
                `title.ilike.%${safe}%,description.ilike.%${safe}%`
              );
            }
          }
        }

        // Default ordering
        query = query.order('received_date', { ascending: false });

        const { data, error } = await query;

        if (!error && data) {
          updateCacheTimestamp('maintenance_tasks');
        }

        return { data: data as MaintenanceTask[], error };
      },
      { operation: 'fetchMaintenanceTasks', filters }
    );
  }

  async fetchMaintenanceTaskById(id: string): Promise<Result<MaintenanceTask>> {
    const { data, error } = await apiClient.query<MaintenanceTask>(
      'maintenance_tasks',
      {
        eq: { column: 'id', value: id },
        limit: 1,
      }
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    return { data: data?.[0] || null, error: null };
  }

  async createMaintenanceTask(
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ): Promise<Result<MaintenanceTask>> {
    const { data, error } = await apiClient.create<MaintenanceTask>(
      'maintenance_tasks',
      task
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('maintenance_tasks');
    }
    return { data: data || null, error: null };
  }

  async updateMaintenanceTask(
    id: string,
    updates: Partial<
      Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    >
  ): Promise<Result<MaintenanceTask>> {
    const { data, error } = await apiClient.update<MaintenanceTask>(
      'maintenance_tasks',
      id,
      updates
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('maintenance_tasks');
    }
    return { data: data || null, error: null };
  }

  async deleteMaintenanceTask(
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const { success, error } = await apiClient.delete('maintenance_tasks', id);
    if (success) {
      invalidateCache('maintenance_tasks');
      return { success: true, error: null };
    }
    return { success: false, error: (error as AppError) || null };
  }

  /**
   * Fetch tasks within date range using server-side filtering
   * ✅ FIXED: Supabase 직접 호출을 withSupabase로 감싸기
   */
  async fetchTasksByDateRange(
    startDate: string,
    endDate: string
  ): Promise<Result<MaintenanceTask[]>> {
    return withSupabase(
      async supabase => {
        // Use OR condition to match any date field within range
        // Format: (received_date in range) OR (scheduled_date in range) OR (due_date in range)
        const { data, error } = await supabase
          .from('maintenance_tasks')
          .select('*')
          .or(
            `and(received_date.gte.${startDate},received_date.lte.${endDate}),` +
              `and(scheduled_date.gte.${startDate},scheduled_date.lte.${endDate}),` +
              `and(due_date.gte.${startDate},due_date.lte.${endDate}),` +
              `and(personal_due_date.gte.${startDate},personal_due_date.lte.${endDate})`
          )
          .order('scheduled_date', { ascending: true, nullsFirst: false })
          .order('due_date', { ascending: true, nullsFirst: false });

        if (!error && data) {
          updateCacheTimestamp('maintenance_tasks');
        }

        return { data: data as MaintenanceTask[], error };
      },
      { operation: 'fetchTasksByDateRange', startDate, endDate }
    );
  }

  async fetchTasksByScheduledDate(
    date: string
  ): Promise<Result<MaintenanceTask[]>> {
    const { data, error } = await apiClient.query<MaintenanceTask>(
      'maintenance_tasks',
      {
        eq: { column: 'scheduled_date', value: date },
        order: { column: 'priority', ascending: false },
      }
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    return { data: data || null, error: null };
  }

  /**
   * Fetch overdue tasks using server-side filtering
   * Tasks are overdue if:
   * - status is 'pending' or 'in_progress'
   * - (due_date < today OR personal_due_date < today)
   * ✅ FIXED: Supabase 직접 호출을 withSupabase로 감싸기
   */
  async fetchOverdueTasks(): Promise<Result<MaintenanceTask[]>> {
    return withSupabase(
      async supabase => {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('maintenance_tasks')
          .select('*')
          .in('status', ['pending', 'in_progress'])
          .or(`due_date.lt.${today},personal_due_date.lt.${today}`)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('personal_due_date', { ascending: true, nullsFirst: false });

        if (!error && data) {
          updateCacheTimestamp('maintenance_tasks');
        }

        return { data: data as MaintenanceTask[], error };
      },
      { operation: 'fetchOverdueTasks' }
    );
  }
}

// 싱글톤 인스턴스 export
export const dataService = new DataService();
