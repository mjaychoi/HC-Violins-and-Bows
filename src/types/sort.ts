/**
 * Common sort field types for different pages
 */

/**
 * Dashboard page sort fields
 */
export type DashboardSortField =
  | 'created_at'
  | 'status'
  | 'serial_number'
  | 'maker'
  | 'type'
  | 'subtype'
  | 'year'
  | 'price'
  | 'ownership';

/**
 * Calendar page sort fields
 */
export type CalendarSortField = 'date' | 'priority' | 'status' | 'type';

/**
 * Clients page sort fields
 * Uses keyof Client, but commonly used fields are listed here for reference
 */
export type ClientSortField =
  | 'created_at'
  | 'first_name'
  | 'last_name'
  | 'contact_number'
  | 'email'
  | 'interest';

/**
 * Generic sort order
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Common sort field configuration
 */
export interface SortFieldConfig<T extends string> {
  field: T;
  label: string;
  defaultOrder?: SortOrder;
}

/**
 * Dashboard sort fields configuration
 */
export const DASHBOARD_SORT_FIELDS: readonly DashboardSortField[] = [
  'created_at',
  'status',
  'serial_number',
  'maker',
  'type',
  'subtype',
  'year',
  'price',
  'ownership',
] as const;

/**
 * Calendar sort fields configuration
 */
export const CALENDAR_SORT_FIELDS: readonly CalendarSortField[] = [
  'date',
  'priority',
  'status',
  'type',
] as const;

/**
 * Client sort fields configuration
 */
export const CLIENT_SORT_FIELDS: readonly ClientSortField[] = [
  'created_at',
  'first_name',
  'last_name',
  'contact_number',
  'email',
  'interest',
] as const;
