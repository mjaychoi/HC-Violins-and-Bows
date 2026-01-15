import { getServerSupabase } from '@/lib/supabase-server';

export interface MigrationCheckResult {
  display_order: boolean;
  allHealthy: boolean;
}

/**
 * TEMPORARY migration health check:
 * - Attempts a query that references the column
 * - Detects "missing column" reliably when possible
 * - Treats other errors as unhealthy (safer than false positives)
 */
export async function checkMigrations(): Promise<MigrationCheckResult> {
  try {
    const supabase = getServerSupabase();

    // Try selecting the column. If the column doesn't exist, Postgres/PostgREST will error.
    const { error } = await supabase
      .from('client_instruments')
      .select('display_order')
      .limit(1);

    if (!error) {
      return { display_order: true, allHealthy: true };
    }

    // Safely read potentially-present structured fields
    const e = error as unknown as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
    };

    const code = typeof e.code === 'string' ? e.code : undefined;
    const details = typeof e.details === 'string' ? e.details : '';
    const hint = typeof e.hint === 'string' ? e.hint : '';
    const rawMessage =
      typeof e.message === 'string'
        ? e.message
        : error instanceof Error
          ? error.message
          : typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message?: unknown }).message
            : '';
    const message = rawMessage;

    const haystack = `${details}\n${hint}\n${message}`.toLowerCase();

    // PostgreSQL undefined_column
    const isUndefinedColumn = code === '42703';

    // Defensive string checks (PostgREST formats can vary)
    const mentionsColumn = haystack.includes('display_order');
    const mentionsDoesNotExist =
      haystack.includes('does not exist') ||
      haystack.includes('undefined column') ||
      (haystack.includes('column') && haystack.includes('does not exist'));

    const isColumnMissing =
      isUndefinedColumn || (mentionsColumn && mentionsDoesNotExist);

    if (isColumnMissing) {
      return { display_order: false, allHealthy: false };
    }

    // Any other error (RLS, permission, network, etc.) → unhealthy (safer)
    return { display_order: false, allHealthy: false };
  } catch {
    // If we can't check, assume unhealthy to be safe
    return { display_order: false, allHealthy: false };
  }
}
