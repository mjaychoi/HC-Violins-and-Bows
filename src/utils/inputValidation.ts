/**
 * Input Validation and Sanitization Utilities
 *
 * Provides utilities for validating and sanitizing user inputs
 * to prevent security vulnerabilities and ensure data integrity.
 */

import { z } from 'zod';
import { parse, isValid, format } from 'date-fns';

// ============================================================================
// Whitelist Validation
// ============================================================================

/**
 * Allowed column names for sorting (whitelist)
 */
export const ALLOWED_SORT_COLUMNS = {
  clients: [
    'created_at',
    'first_name',
    'last_name',
    'email',
    'contact_number',
    'client_number',
  ] as const,
  instruments: [
    'created_at',
    'type',
    'maker',
    'serial_number',
    'status',
    'price',
  ] as const,
  connections: ['created_at', 'relationship_type'] as const,
  maintenance_tasks: [
    'created_at',
    'received_date',
    'due_date',
    'scheduled_date',
    'priority',
    'status',
  ] as const,
  sales_history: ['created_at', 'sale_date', 'sale_price'] as const,
} as const;

/**
 * Validate sort column name against whitelist
 */
export function validateSortColumn(
  table: keyof typeof ALLOWED_SORT_COLUMNS,
  column: string | null
): string {
  const allowed = ALLOWED_SORT_COLUMNS[table];
  if (!column) {
    return allowed[0] as string; // Return default column
  }
  // Type-safe check
  const allowedSet = new Set(allowed as readonly string[]);
  if (allowedSet.has(column)) {
    return column;
  }
  return allowed[0] as string; // Return default column
}

/**
 * Validate UUID format
 */
export function validateUUID(id: string | null | undefined): boolean {
  if (!id) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validate date string format (YYYY-MM-DD)
 * Uses date-fns parse + round-trip check to prevent JS Date auto-correction issues
 */
export function validateDateString(date: string | null | undefined): boolean {
  if (!date) return false;

  // First check format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;

  try {
    // Parse using date-fns (more reliable than new Date)
    const parsed = parse(date, 'yyyy-MM-dd', new Date());

    // Check if valid date and round-trip matches (prevents auto-correction like 2025-02-31)
    return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === date;
  } catch {
    return false;
  }
}

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 * Removes potentially dangerous characters and trims whitespace
 */
export function sanitizeString(
  input: string | null | undefined,
  maxLength?: number
): string {
  if (!input) return '';

  let sanitized = input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize number input
 * NOTE: This function CLAMPS values (silently modifies out-of-range values).
 * For API validation, consider returning null instead of clamping for better error detection.
 *
 * @param clamp - If true, clamp values to min/max. If false, return null for out-of-range (API validation mode).
 */
export function sanitizeNumber(
  input: unknown,
  min?: number,
  max?: number,
  clamp: boolean = true
): number | null {
  if (input === null || input === undefined) return null;

  const num = typeof input === 'number' ? input : Number(input);

  if (isNaN(num)) return null;

  if (min !== undefined && num < min) {
    return clamp ? min : null;
  }
  if (max !== undefined && num > max) {
    return clamp ? max : null;
  }

  return num;
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(sanitized) ? sanitized : null;
}

/**
 * Sanitize search term for safe use
 * NOTE: Removing % _ \ can break legitimate searches (e.g., "50% off", "A_B test").
 * Instead, handle SQL escaping at the query level (Supabase ilike handles this).
 * This function now only removes control characters and limits length.
 */
export function sanitizeSearchTerm(
  term: string | null | undefined,
  maxLength = 100
): string {
  if (!term) return '';

  return term
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters only
  // NOTE: SQL wildcards (% _) and escape (\\) should be handled at query level
  // Supabase ilike automatically escapes these, so we don't remove them here
}

/**
 * Escape characters that have special meaning in PostgREST filters
 * (%, _, ,, (, ), \)
 */
export function escapePostgrestFilterValue(value: string): string {
  return value.replace(/[%_,()\\]/g, match => `\\${match}`);
}

// ============================================================================
// Partial Update Validation
// ============================================================================

/**
 * Create a partial schema validator for PATCH requests
 * Only validates fields that are present in the update object
 */
export function createPartialValidator<T extends z.ZodRawShape>(
  fullSchema: z.ZodObject<T>
): z.ZodType<Partial<z.infer<z.ZodObject<T>>>> {
  return fullSchema.partial() as z.ZodType<Partial<z.infer<z.ZodObject<T>>>>;
}

/**
 * Validate partial update data
 */
export function validatePartialUpdate<T>(
  data: unknown,
  validator: z.ZodType<Partial<T>>
): { success: true; data: Partial<T> } | { success: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { success: false, error: 'Update data must be an object' };
  }

  const parseResult = validator.safeParse(data);

  if (!parseResult.success) {
    const { error } = parseResult;
    const message = error.issues?.length
      ? error.issues.map(issue => issue.message).join(', ')
      : error.message || 'Validation failed';

    return { success: false, error: message };
  }

  return { success: true, data: parseResult.data };
}

// ============================================================================
// Query Parameter Validation
// ============================================================================

/**
 * Validate and sanitize query parameters
 */
export interface QueryParams {
  orderBy?: string;
  ascending?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  [key: string]: string | undefined;
}

export function validateQueryParams(
  params: QueryParams,
  options: {
    allowedColumns?: readonly string[];
    defaultColumn?: string;
    maxPageSize?: number;
  } = {}
): {
  orderBy: string;
  ascending: boolean;
  page: number;
  pageSize: number;
  search?: string;
} {
  const {
    allowedColumns = [],
    defaultColumn = 'created_at',
    maxPageSize = 100,
  } = options;

  // Validate orderBy
  const orderBy = params.orderBy || defaultColumn;
  const validOrderBy =
    allowedColumns.length > 0
      ? allowedColumns.includes(orderBy)
        ? orderBy
        : defaultColumn
      : orderBy;

  // Validate ascending
  const ascending = params.ascending !== 'false';

  // Validate page
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);

  // Validate pageSize
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, parseInt(params.pageSize || '10', 10) || 10)
  );

  // Sanitize search
  const search = params.search ? sanitizeSearchTerm(params.search) : undefined;

  return {
    orderBy: validOrderBy,
    ascending,
    page,
    pageSize,
    search: search || undefined,
  };
}
