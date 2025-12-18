import type { TaskType, TaskStatus, TaskPriority } from '@/types';

/**
 * Calendar filter state
 * Single source of truth: status and owner are the only filter values
 * UI components (quick filters vs main filters) are just entry points to set these values
 */
export interface CalendarFilters {
  type: TaskType | 'all';
  priority: TaskPriority | 'all';
  status: TaskStatus | 'all'; // Single source of truth for status filter
  owner: string | 'all'; // Single source of truth for ownership filter
}

/**
 * Empty calendar filter state
 */
export const EMPTY_CALENDAR_FILTERS: CalendarFilters = {
  type: 'all',
  priority: 'all',
  status: 'all',
  owner: 'all',
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
