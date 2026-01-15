import {
  Client,
  Instrument,
  ClientInstrument,
  MaintenanceTask,
  TaskFilters,
  TaskType,
  RelationshipType,
  TaskPriority,
  TaskStatus,
} from '@/types';
import {
  apiClient,
  QueryFilter,
  TableName,
  TableRowMap,
  AllowedColumn,
} from '@/utils/apiClient';
import { getSupabaseClient } from '@/lib/supabase-client';
import { AppError, ErrorCodes } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';

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

const INSTRUMENT_STATUSES: Instrument['status'][] = [
  'Available',
  'Booked',
  'Sold',
  'Reserved',
  'Maintenance',
];

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'Interested',
  'Sold',
  'Booked',
  'Owned',
];

const MAINTENANCE_STATUSES: TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
];

const MAINTENANCE_PRIORITIES: TaskPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];

const TASK_TYPES: TaskType[] = [
  'repair',
  'rehair',
  'maintenance',
  'inspection',
  'setup',
  'adjustment',
  'restoration',
];

function ensureTaskType(value: string | null): TaskType {
  if (value && TASK_TYPES.includes(value as TaskType)) {
    return value as TaskType;
  }
  return 'maintenance';
}

type QueryColumn<T extends TableName> = AllowedColumn<T>;

interface EntityFetchOptions<T extends TableName> {
  select?: string;
  eq?: QueryFilter<T>;
  orderBy?: { column: QueryColumn<T>; ascending?: boolean };
  limit?: number;
}

const nowISOString = () => new Date().toISOString();

function ensureInstrumentStatus(value: string | null): Instrument['status'] {
  if (value && INSTRUMENT_STATUSES.includes(value as Instrument['status'])) {
    return value as Instrument['status'];
  }
  return 'Available';
}

function normalizeClientRow(row: TableRowMap['clients']): Client {
  return {
    id: row.id,
    last_name: row.last_name,
    first_name: row.first_name,
    contact_number: row.contact_number,
    email: row.email,
    tags: row.tags ?? [],
    interest: row.interest,
    note: row.note,
    client_number: row.client_number,
    created_at: row.created_at ?? nowISOString(),
  };
}

function normalizeClients(rows: TableRowMap['clients'][]): Client[] {
  return rows.map(normalizeClientRow);
}

function normalizeInstrumentRow(row: TableRowMap['instruments']): Instrument {
  return {
    id: row.id,
    status: ensureInstrumentStatus(row.status),
    maker: row.maker,
    type: row.type,
    subtype: row.subtype,
    year: row.year,
    certificate: row.certificate,
    certificate_name: row.certificate_name ?? null,
    cost_price: row.cost_price ?? null,
    consignment_price: row.consignment_price ?? null,
    size: row.size,
    weight: row.weight,
    price: row.price,
    ownership: row.ownership,
    note: row.note,
    serial_number: row.serial_number,
    has_certificate:
      (row as { has_certificate?: boolean }).has_certificate ?? false,
    created_at: row.created_at ?? nowISOString(),
    updated_at: row.updated_at ?? null,
  };
}

function normalizeInstruments(
  rows: TableRowMap['instruments'][]
): Instrument[] {
  return rows.map(normalizeInstrumentRow);
}

function normalizeClientInstrumentRow(
  row: TableRowMap['connections']
): ClientInstrument | null {
  if (!row.client_id || !row.instrument_id) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[dataService] Dropping incomplete client_instruments row',
        row.id
      );
    }
    return null;
  }

  const relationship_type = RELATIONSHIP_TYPES.includes(
    row.relationship_type as RelationshipType
  )
    ? (row.relationship_type as RelationshipType)
    : 'Interested';

  return {
    id: row.id,
    client_id: row.client_id,
    instrument_id: row.instrument_id,
    relationship_type,
    notes: row.notes,
    display_order: row.display_order,
    created_at: row.created_at ?? nowISOString(),
  };
}

function normalizeClientInstruments(
  rows: TableRowMap['connections'][]
): ClientInstrument[] {
  return rows
    .map(normalizeClientInstrumentRow)
    .filter(
      (item): item is ClientInstrument => item !== null && item !== undefined
    );
}

function normalizeMaintenanceTaskRow(
  row: TableRowMap['maintenance_tasks']
): MaintenanceTask | null {
  if (!row.instrument_id) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[dataService] Maintenance task missing instrument_id',
        row.id
      );
    }
    return null;
  }

  const status = MAINTENANCE_STATUSES.includes(row.status as TaskStatus)
    ? (row.status as TaskStatus)
    : 'pending';
  const priority = MAINTENANCE_PRIORITIES.includes(row.priority as TaskPriority)
    ? (row.priority as TaskPriority)
    : 'medium';

  const created_at = row.created_at ?? nowISOString();
  const updated_at = row.updated_at ?? created_at;

  return {
    id: row.id,
    instrument_id: row.instrument_id,
    client_id: row.client_id ?? null,
    task_type: ensureTaskType(row.task_type),
    title: row.title,
    description: row.description,
    status,
    received_date: row.received_date || created_at,
    due_date: row.due_date,
    personal_due_date: row.personal_due_date,
    scheduled_date: row.scheduled_date,
    completed_date: row.completed_date,
    priority,
    estimated_hours: row.estimated_hours,
    actual_hours: row.actual_hours,
    cost: row.cost,
    notes: row.notes,
    created_at,
    updated_at,
  };
}

function normalizeMaintenanceTasks(
  rows: TableRowMap['maintenance_tasks'][]
): MaintenanceTask[] {
  return rows
    .map(normalizeMaintenanceTaskRow)
    .filter(
      (item): item is MaintenanceTask => item !== null && item !== undefined
    );
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
  async fetchClients(
    options?: EntityFetchOptions<'clients'>
  ): Promise<Result<Client[]>> {
    const { data, error } = await apiClient.query('clients', {
      select:
        options?.select ||
        'id, client_id, instrument_id, relationship_type, notes, display_order, created_at',
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    const normalized = data ? normalizeClients(data) : null;
    if (data) {
      updateCacheTimestamp('clients');
    }
    return { data: normalized, error: null };
  }

  async fetchClientById(id: string): Promise<Result<Client>> {
    const { data, error } = await apiClient.query('clients', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    const client = data?.[0] ? normalizeClientRow(data[0]) : null;
    return { data: client, error: null };
  }

  async createClient(
    clientData: Omit<Client, 'id' | 'created_at'>
  ): Promise<Result<Client>> {
    const { data, error } = await apiClient.create('clients', clientData);
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('clients');
    }
    const created = data ? normalizeClientRow(data) : null;
    return { data: created, error: null };
  }

  async updateClient(
    id: string,
    clientData: Partial<Client>
  ): Promise<Result<Client>> {
    const { data, error } = await apiClient.update('clients', id, clientData);
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('clients');
    }
    const updated = data ? normalizeClientRow(data) : null;
    return { data: updated, error: null };
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
    options?: EntityFetchOptions<'instruments'>
  ): Promise<Result<Instrument[]>> {
    const { data, error } = await apiClient.query('instruments', {
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
    const normalized = data ? normalizeInstruments(data) : null;
    return { data: normalized, error: null };
  }

  async fetchInstrumentById(id: string): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.query('instruments', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    const instrument = data?.[0] ? normalizeInstrumentRow(data[0]) : null;
    return { data: instrument, error: null };
  }

  async createInstrument(
    instrumentData: Omit<Instrument, 'id' | 'created_at'>
  ): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.create(
      'instruments',
      instrumentData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('instruments');
    }
    const created = data ? normalizeInstrumentRow(data) : null;
    return { data: created, error: null };
  }

  async updateInstrument(
    id: string,
    instrumentData: Partial<Instrument>
  ): Promise<Result<Instrument>> {
    const { data, error } = await apiClient.update(
      'instruments',
      id,
      instrumentData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('instruments');
    }
    const updated = data ? normalizeInstrumentRow(data) : null;
    return { data: updated, error: null };
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
    options?: EntityFetchOptions<'connections'>
  ): Promise<Result<ClientInstrument[]>> {
    const { data, error } = await apiClient.query('connections', {
      // ✅ nested join 제거 (clients/instruments는 따로 fetch하니까 중복)
      select:
        options?.select ||
        'id, client_id, instrument_id, relationship_type, notes, display_order, created_at',
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });

    if (error) return { data: null, error: error as AppError };
    if (data) updateCacheTimestamp('connections');

    const normalized = data ? normalizeClientInstruments(data) : null;
    return { data: normalized, error: null };
  }

  async createConnection(
    connectionData: Omit<
      ClientInstrument,
      'id' | 'created_at' | 'client' | 'instrument'
    >
  ): Promise<Result<ClientInstrument>> {
    const { data, error } = await apiClient.create(
      'connections',
      connectionData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('connections');
    }
    const created = data ? normalizeClientInstrumentRow(data) : null;
    return { data: created, error: null };
  }

  async updateConnection(
    id: string,
    connectionData: Partial<ClientInstrument>
  ): Promise<Result<ClientInstrument>> {
    const { data, error } = await apiClient.update(
      'connections',
      id,
      connectionData
    );
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('connections');
    }
    const updated = data ? normalizeClientInstrumentRow(data) : null;
    return { data: updated, error: null };
  }

  async deleteConnection(
    id: string
  ): Promise<{ success: boolean; error: AppError | null }> {
    const { success, error } = await apiClient.delete('connections', id);
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

        const rows = (data ?? []) as TableRowMap['maintenance_tasks'][];
        const normalized = normalizeMaintenanceTasks(rows);
        return { data: normalized, error };
      },
      { operation: 'fetchMaintenanceTasks', filters }
    );
  }

  async fetchMaintenanceTaskById(id: string): Promise<Result<MaintenanceTask>> {
    const { data, error } = await apiClient.query('maintenance_tasks', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    const task = data?.[0] ? normalizeMaintenanceTaskRow(data[0]) : null;
    return { data: task, error: null };
  }

  async createMaintenanceTask(
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ): Promise<Result<MaintenanceTask>> {
    const { data, error } = await apiClient.create('maintenance_tasks', task);
    if (error) {
      return { data: null, error: error as AppError };
    }
    if (data) {
      invalidateCache('maintenance_tasks');
    }
    const created = data ? normalizeMaintenanceTaskRow(data) : null;
    return { data: created, error: null };
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
    const { data, error } = await apiClient.update(
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
    const updated = data ? normalizeMaintenanceTaskRow(data) : null;
    return { data: updated, error: null };
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

        const rows = (data ?? []) as TableRowMap['maintenance_tasks'][];
        const normalized = normalizeMaintenanceTasks(rows);
        return { data: normalized, error };
      },
      { operation: 'fetchTasksByDateRange', startDate, endDate }
    );
  }

  async fetchTasksByScheduledDate(
    date: string
  ): Promise<Result<MaintenanceTask[]>> {
    const { data, error } = await apiClient.query('maintenance_tasks', {
      eq: { column: 'scheduled_date', value: date },
      order: { column: 'priority', ascending: false },
    });
    if (error) {
      return { data: null, error: error as AppError };
    }
    const normalized = data ? normalizeMaintenanceTasks(data) : null;
    return { data: normalized, error: null };
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

        const rows = (data ?? []) as TableRowMap['maintenance_tasks'][];
        const normalized = normalizeMaintenanceTasks(rows);
        return { data: normalized, error };
      },
      { operation: 'fetchOverdueTasks' }
    );
  }
}

// 싱글톤 인스턴스 export
export const dataService = new DataService();
