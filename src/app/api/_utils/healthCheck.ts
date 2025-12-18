import { getServerSupabase } from '@/lib/supabase-server';

/**
 * Migration health check result
 */
export interface MigrationCheckResult {
  display_order: boolean;
  allHealthy: boolean;
}

/**
 * Check if required database columns exist (migration health check)
 * Returns true if all required columns exist, false otherwise
 *
 * ⚠️ TEMPORARY CHECK: This is a pragmatic MVP approach that checks for column
 * existence by attempting a query and parsing error messages. This method may
 * break if PostgREST error message formats change.
 *
 * For production stability, consider:
 * - Using information_schema.columns via RPC function
 * - Creating a Supabase SQL function that returns boolean
 * - Using a dedicated migration tracking table
 *
 * Uses error code/details/hint fields when available for more reliable detection
 * Falls back to message string matching if structured fields are not available
 */
export async function checkMigrations(): Promise<MigrationCheckResult> {
  try {
    const supabase = getServerSupabase();

    // Check if display_order column exists in client_instruments table
    // We do this by attempting a query that uses the column
    // If the column doesn't exist, we'll get an error
    const { error } = await supabase
      .from('client_instruments')
      .select('display_order')
      .limit(1);

    if (!error) {
      return {
        display_order: true,
        allHealthy: true,
      };
    }

    // Check structured error fields first (more reliable than string matching)
    const errorCode = (error as { code?: string })?.code;
    const errorDetails = (error as { details?: string })?.details;
    const errorHint = (error as { hint?: string })?.hint;
    const errorMessage = error.message || '';

    // PostgreSQL error code for undefined column: 42703
    // PostgREST may also return structured hints/details about missing columns
    // NOTE: errorDetails/errorHint string matching may break if PostgREST version changes
    const isColumnMissing =
      errorCode === '42703' ||
      (typeof errorDetails === 'string' &&
        errorDetails.toLowerCase().includes('display_order')) ||
      (typeof errorHint === 'string' &&
        errorHint.toLowerCase().includes('display_order')) ||
      errorMessage.toLowerCase().includes('does not exist');

    const display_order = !isColumnMissing;

    return {
      display_order,
      allHealthy: display_order,
    };
  } catch {
    // If we can't check, assume unhealthy to be safe
    // ✅ FIXED: Remove unused error variable
    return {
      display_order: false,
      allHealthy: false,
    };
  }
}
