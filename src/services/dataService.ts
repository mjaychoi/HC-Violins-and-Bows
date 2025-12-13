import { Client, Instrument, ClientInstrument, MaintenanceTask, TaskFilters } from '@/types';
import { apiClient } from '@/utils/apiClient';
import { getSupabase } from '@/lib/supabase';

type CacheKey = 'clients' | 'instruments' | 'connections' | 'maintenance_tasks';
type SortDirection = 'asc' | 'desc';

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
    
    // Null/undefined handling: always push to end
    if (av === undefined || av === null) return dir; // End for asc, start for desc
    if (bv === undefined || bv === null) return -dir;
    
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
  const filtered = items.filter(item => matchesFilter(item, filter) && matchesSearch(item, searchTerm, searchFields));
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
  searchFields: Array<keyof Instrument> = ['maker', 'type', 'subtype', 'serial_number']
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
class DataService {
  // ============================================================================
  // Clients
  // ============================================================================

  async fetchClients(options?: FetchOptions): Promise<{ data: Client[] | null; error: unknown }> {
    const { data, error } = await apiClient.query<Client>('clients', {
      select: options?.select,
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (!error && data) {
      updateCacheTimestamp('clients');
    }
    return { data, error };
  }

  async fetchClientById(id: string): Promise<{ data: Client | null; error: unknown }> {
    const { data, error } = await apiClient.query<Client>('clients', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    return { data: data?.[0] || null, error };
  }

  async createClient(clientData: Omit<Client, 'id' | 'created_at'>): Promise<{ data: Client | null; error: unknown }> {
    const { data, error } = await apiClient.create<Client>('clients', clientData);
    if (!error && data) {
      invalidateCache('clients');
    }
    return { data, error };
  }

  async updateClient(id: string, clientData: Partial<Client>): Promise<{ data: Client | null; error: unknown }> {
    const { data, error } = await apiClient.update<Client>('clients', id, clientData);
    if (!error && data) {
      invalidateCache('clients');
    }
    return { data, error };
  }

  async deleteClient(id: string): Promise<{ success: boolean; error: unknown }> {
    const { success, error } = await apiClient.delete('clients', id);
    if (success) {
      invalidateCache('clients');
    }
    return { success, error };
  }

  // ============================================================================
  // Instruments
  // ============================================================================

  async fetchInstruments(options?: FetchOptions): Promise<{ data: Instrument[] | null; error: unknown }> {
    const { data, error } = await apiClient.query<Instrument>('instruments', {
      select: options?.select,
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (!error && data) {
      updateCacheTimestamp('instruments');
    }
    return { data, error };
  }

  async fetchInstrumentById(id: string): Promise<{ data: Instrument | null; error: unknown }> {
    const { data, error } = await apiClient.query<Instrument>('instruments', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    return { data: data?.[0] || null, error };
  }

  async createInstrument(instrumentData: Omit<Instrument, 'id' | 'created_at'>): Promise<{ data: Instrument | null; error: unknown }> {
    const { data, error } = await apiClient.create<Instrument>('instruments', instrumentData);
    if (!error && data) {
      invalidateCache('instruments');
    }
    return { data, error };
  }

  async updateInstrument(id: string, instrumentData: Partial<Instrument>): Promise<{ data: Instrument | null; error: unknown }> {
    const { data, error } = await apiClient.update<Instrument>('instruments', id, instrumentData);
    if (!error && data) {
      invalidateCache('instruments');
    }
    return { data, error };
  }

  async deleteInstrument(id: string): Promise<{ success: boolean; error: unknown }> {
    const { success, error } = await apiClient.delete('instruments', id);
    if (success) {
      invalidateCache('instruments');
    }
    return { success, error };
  }

  // ============================================================================
  // Client-Instrument Connections
  // ============================================================================

  async fetchConnections(options?: FetchOptions): Promise<{ data: ClientInstrument[] | null; error: unknown }> {
    // Note: 'client_instruments' is not in ALLOWED_SORT_COLUMNS, using connections table name instead
    // This is a workaround - ideally apiClient.query should accept table names directly
    // Type assertion is necessary here as 'connections' is a valid table but not in strict ALLOWED_SORT_COLUMNS
    const { data, error } = await apiClient.query<ClientInstrument>('connections' as 'instruments' | 'clients' | 'sales_history' | 'maintenance_tasks' | 'connections', {
      select: options?.select || '*, client:clients(*), instrument:instruments(*)',
      eq: options?.eq,
      order: options?.orderBy,
      limit: options?.limit,
    });
    if (!error && data) {
      updateCacheTimestamp('connections');
    }
    return { data, error };
  }

  async createConnection(connectionData: Omit<ClientInstrument, 'id' | 'created_at' | 'client' | 'instrument'>): Promise<{ data: ClientInstrument | null; error: unknown }> {
    const { data, error } = await apiClient.create<ClientInstrument>('client_instruments', connectionData);
    if (!error && data) {
      invalidateCache('connections');
    }
    return { data, error };
  }

  async updateConnection(id: string, connectionData: Partial<ClientInstrument>): Promise<{ data: ClientInstrument | null; error: unknown }> {
    const { data, error } = await apiClient.update<ClientInstrument>('client_instruments', id, connectionData);
    if (!error && data) {
      invalidateCache('connections');
    }
    return { data, error };
  }

  async deleteConnection(id: string): Promise<{ success: boolean; error: unknown }> {
    const { success, error } = await apiClient.delete('client_instruments', id);
    if (success) {
      invalidateCache('connections');
    }
    return { success, error };
  }

  // ============================================================================
  // Maintenance Tasks
  // ============================================================================

  /**
   * Fetch maintenance tasks with filters using server-side querying
   * Uses Supabase directly for efficient filtering
   */
  async fetchMaintenanceTasks(filters?: TaskFilters): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    try {
      const supabase = getSupabase();
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
          // Server-side search using ilike
          const searchTerm = filters.search.trim();
          if (searchTerm) {
            query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
          }
        }
      }
      
      // Default ordering
      query = query.order('received_date', { ascending: false });
      
      const { data, error } = await query;
      
      if (error) {
        return { data: null, error };
      }
      
      if (!error && data) {
        updateCacheTimestamp('maintenance_tasks');
      }
      
      return { data: data as MaintenanceTask[], error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async fetchMaintenanceTaskById(id: string): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    const { data, error } = await apiClient.query<MaintenanceTask>('maintenance_tasks', {
      eq: { column: 'id', value: id },
      limit: 1,
    });
    return { data: data?.[0] || null, error };
  }

  async createMaintenanceTask(task: Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    const { data, error } = await apiClient.create<MaintenanceTask>('maintenance_tasks', task);
    if (!error && data) {
      invalidateCache('maintenance_tasks');
    }
    return { data, error };
  }

  async updateMaintenanceTask(id: string, updates: Partial<Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>>): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    const { data, error } = await apiClient.update<MaintenanceTask>('maintenance_tasks', id, updates);
    if (!error && data) {
      invalidateCache('maintenance_tasks');
    }
    return { data, error };
  }

  async deleteMaintenanceTask(id: string): Promise<{ success: boolean; error: unknown }> {
    const { success, error } = await apiClient.delete('maintenance_tasks', id);
    if (success) {
      invalidateCache('maintenance_tasks');
    }
    return { success, error };
  }

  /**
   * Fetch tasks within date range using server-side filtering
   * Uses Supabase query directly for efficient server-side filtering
   */
  async fetchTasksByDateRange(startDate: string, endDate: string): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    try {
      const supabase = getSupabase();
      
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
      
      if (error) {
        return { data: null, error };
      }
      
      if (!error && data) {
        updateCacheTimestamp('maintenance_tasks');
      }
      
      return { data: data as MaintenanceTask[], error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async fetchTasksByScheduledDate(date: string): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    const { data, error } = await apiClient.query<MaintenanceTask>('maintenance_tasks', {
      eq: { column: 'scheduled_date', value: date },
      order: { column: 'priority', ascending: false },
    });
    return { data, error };
  }

  /**
   * Fetch overdue tasks using server-side filtering
   * Tasks are overdue if:
   * - status is 'pending' or 'in_progress'
   * - (due_date < today OR personal_due_date < today)
   */
  async fetchOverdueTasks(): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    try {
      const supabase = getSupabase();
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .or(`due_date.lt.${today},personal_due_date.lt.${today}`)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('personal_due_date', { ascending: true, nullsFirst: false });
      
      if (error) {
        return { data: null, error };
      }
      
      if (!error && data) {
        updateCacheTimestamp('maintenance_tasks');
      }
      
      return { data: data as MaintenanceTask[], error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

// 싱글톤 인스턴스 export
export const dataService = new DataService();
