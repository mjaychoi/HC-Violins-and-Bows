import type { MaintenanceTask } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';
import type { CalendarFilters } from '../types';
import {
  filterByDateRange,
  filterByStatus,
  filterByOwnership,
  filterBySearchFilters,
} from './filterUtils';
import { searchTasks } from './searchUtils';

export interface InstrumentInfo {
  type: string | null;
  maker: string | null;
  ownership: string | null;
  serial_number?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  [key: string]: unknown;
}

/**
 * Filter calendar tasks using CalendarFilters state
 */
export function filterCalendarTasks(
  tasks: MaintenanceTask[],
  filters: CalendarFilters,
  dateRange: DateRange | null,
  filterOperator: FilterOperator,
  instrumentsMap: Map<string, InstrumentInfo>,
  searchTerm: string
): MaintenanceTask[] {
  let filtered = [...tasks];

  // Date range filter (applied first)
  if (dateRange) {
    filtered = filterByDateRange(filtered, dateRange, filterOperator);
  }

  // Status filter - use main filterStatus or fallback to quick filter status
  const effectiveStatusFilter =
    filters.filterStatus !== 'all'
      ? filters.filterStatus
      : filters.status !== 'all'
      ? filters.status
      : 'all';

  if (effectiveStatusFilter !== 'all') {
    filtered = filterByStatus(filtered, effectiveStatusFilter);
  }

  // Ownership filter - use main filterOwnership or fallback to quick filter owner
  const effectiveOwnershipFilter =
    filters.filterOwnership !== 'all'
      ? filters.filterOwnership
      : filters.owner !== 'all'
      ? filters.owner
      : 'all';

  if (effectiveOwnershipFilter !== 'all') {
    // Convert InstrumentInfo map to the expected format
    const ownershipMap = new Map<
      string,
      {
        ownership: string | null;
        [key: string]: unknown;
      }
    >();
    instrumentsMap.forEach((value, key) => {
      ownershipMap.set(key, {
        ownership: value.ownership,
      });
    });
    filtered = filterByOwnership(filtered, effectiveOwnershipFilter, ownershipMap);
  }

  // Quick filters (type, priority) - only if not 'all'
  if (filters.type !== 'all' || filters.priority !== 'all') {
    // Convert InstrumentInfo map to the expected format
    const searchMap = new Map<
      string,
      {
        ownership: string | null;
        [key: string]: unknown;
      }
    >();
    instrumentsMap.forEach((value, key) => {
      searchMap.set(key, {
        ownership: value.ownership,
      });
    });
    filtered = filterBySearchFilters(
      filtered,
      {
        type: filters.type !== 'all' ? filters.type : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        status: undefined, // Already handled above
        owner: undefined, // Already handled above
      },
      searchMap
    );
  }

  // Text search
  if (searchTerm.trim()) {
    filtered = searchTasks(filtered, searchTerm, instrumentsMap);
  }

  return filtered;
}

/**
 * Count active calendar filters
 */
export function countActiveCalendarFilters(
  filters: CalendarFilters,
  dateRange: DateRange | null,
  searchTerm: string
): number {
  let count = 0;

  // Quick filters
  if (filters.type !== 'all') count++;
  if (filters.priority !== 'all') count++;
  if (filters.status !== 'all') count++;
  if (filters.owner !== 'all') count++;

  // Main filters (only count if different from quick filters)
  if (filters.filterStatus !== 'all' && filters.filterStatus !== filters.status) count++;
  if (filters.filterOwnership !== 'all' && filters.filterOwnership !== filters.owner) count++;

  // Date range
  if (dateRange?.from || dateRange?.to) count++;

  // Search term
  if (searchTerm.trim()) count++;

  return count;
}
