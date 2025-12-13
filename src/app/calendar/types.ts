import type { TaskType, TaskStatus, TaskPriority } from '@/types';

/**
 * Calendar filter state
 */
export interface CalendarFilters {
  // Quick filters (single selection, 'all' means no filter)
  type: TaskType | 'all';
  priority: TaskPriority | 'all';
  status: TaskStatus | 'all';
  owner: string | 'all';
  // Main filters (separate from quick filters for UI separation)
  filterStatus: TaskStatus | 'all';
  filterOwnership: string | 'all';
}

/**
 * Empty calendar filter state
 */
export const EMPTY_CALENDAR_FILTERS: CalendarFilters = {
  type: 'all',
  priority: 'all',
  status: 'all',
  owner: 'all',
  filterStatus: 'all',
  filterOwnership: 'all',
};

/**
 * Calendar filter options
 */
export interface CalendarFilterOptions {
  types: TaskType[];
  priorities: TaskPriority[];
  statuses: TaskStatus[];
  owners: string[];
}
