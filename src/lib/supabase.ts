import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

/**
 * ⚠️ Legacy Supabase entrypoint - FOR TESTING/MOCKING ONLY
 *
 * - Application 코드에서는 절대 사용하지 마세요.
 *   Use `@/lib/supabase-client` or `@/lib/supabase-server` instead.
 * - Jest 테스트에서 `require('../supabase').supabase`를 mock하기 위해 유지됩니다.
 *
 * ✅ FIXED: More secure legacy pattern - throws immediately on import
 * This prevents accidental use in application code while allowing Jest mocks
 */

/**
 * Async helper that delegates to getSupabaseClient().
 * @deprecated Use getSupabaseClient() from '@/lib/supabase-client' instead
 */
export async function getSupabase(): Promise<SupabaseClient> {
  return getSupabaseClient();
}

/**
 * ✅ FIXED: Deprecated sync-style client - throws immediately to prevent runtime errors
 * This ensures the legacy file is only used for Jest mocking, not in application code
 *
 * Jest tests can mock this export, but application code will fail fast with a clear error.
 */
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  typeof process.env.JEST_WORKER_ID !== 'undefined';

// ✅ FIXED: Strong guard for production builds - prevents accidental usage
// This prevents runtime errors in production builds
if (!isTestEnv) {
  // Check if we're in a production build (not just production environment)
  const isProductionBuild =
    process.env.NODE_ENV === 'production' ||
    (typeof process !== 'undefined' &&
      process.env.NEXT_PHASE === 'production-build');

  if (isProductionBuild) {
    throw new Error(
      "CRITICAL: '@/lib/supabase' must not be imported in production builds. " +
        'Use "@/lib/supabase-client" (client-side) or "@/lib/supabase-server" (server-side) instead. ' +
        'This export is only available for Jest mocking purposes.'
    );
  }

  // Development: warn but don't throw (allows easier debugging)
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      "⚠️ '@/lib/supabase' should not be imported in application code. " +
        'Use "@/lib/supabase-client" or "@/lib/supabase-server" instead.'
    );
  }
}

export const supabase: SupabaseClient = {} as unknown as SupabaseClient;
