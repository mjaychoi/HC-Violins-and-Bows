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

export interface OwnershipMap {
  ownership: string | null;
}

/**
 * Filter calendar tasks using CalendarFilters state
 * @param ownershipMap - Pre-computed ownership map (reused to avoid recreating on each call)
 */
export function filterCalendarTasks(
  tasks: MaintenanceTask[],
  filters: CalendarFilters,
  dateRange: DateRange | null,
  filterOperator: FilterOperator,
  instrumentsMap: Map<string, InstrumentInfo>,
  searchTerm: string,
  ownershipMap: Map<string, OwnershipMap>
): MaintenanceTask[] {
  let filtered = [...tasks];

  // Date range filter (applied first)
  if (dateRange) {
    filtered = filterByDateRange(filtered, dateRange, filterOperator);
  }

  // Status filter - single source of truth
  if (filters.status !== 'all') {
    filtered = filterByStatus(filtered, filters.status);
  }

  // Ownership filter - single source of truth
  if (filters.owner !== 'all') {
    // Use pre-computed ownershipMap (no conversion needed)
    filtered = filterByOwnership(filtered, filters.owner, ownershipMap);
  }

  // Quick filters (type, priority) - only if not 'all'
  if (filters.type !== 'all' || filters.priority !== 'all') {
    // Use pre-computed ownershipMap (no conversion needed)
    filtered = filterBySearchFilters(
      filtered,
      {
        type: filters.type !== 'all' ? filters.type : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        status: undefined, // Already handled above
        owner: undefined, // Already handled above
      },
      ownershipMap
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
 * Simplified: no need to check for duplicates since we have single source of truth
 */
export function countActiveCalendarFilters(
  filters: CalendarFilters,
  dateRange: DateRange | null,
  searchTerm: string
): number {
  let count = 0;

  // Filter fields (single source of truth)
  if (filters.type !== 'all') count++;
  if (filters.priority !== 'all') count++;
  if (filters.status !== 'all') count++;
  if (filters.owner !== 'all') count++;

  // Date range
  if (dateRange?.from || dateRange?.to) count++;

  // Search term
  if (searchTerm.trim()) count++;

  return count;
}
