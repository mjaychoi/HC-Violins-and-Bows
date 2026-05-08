import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

/**
 * ⚠️ Legacy Supabase entrypoint - FOR TESTING/MOCKING ONLY
 *
 * Application code must not use this file.
 * Use:
 * - '@/lib/supabase-client' for browser/client-side code
 * - '@/lib/supabase-server' for server/admin/cookie-backed code
 *
 * This file remains only for legacy Jest mocks that import '@/lib/supabase'.
 */

/**
 * Async helper that delegates to getSupabaseClient().
 *
 * @deprecated Use getSupabaseClient() from '@/lib/supabase-client' instead.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  return getSupabaseClient();
}

const LEGACY_SUPABASE_ERROR =
  "Do not use '@/lib/supabase' in application code. " +
  "Use '@/lib/supabase-client' for client-side code or " +
  "'@/lib/supabase-server' for server-side code instead.";

/**
 * Deprecated sync-style client.
 *
 * Importing this file is allowed so Next.js static analysis/build does not crash.
 * Actual runtime usage fails fast with a clear error.
 *
 * Jest tests may mock this export.
 */
export const supabase: SupabaseClient = new Proxy(
  {},
  {
    get() {
      throw new Error(LEGACY_SUPABASE_ERROR);
    },
    set() {
      throw new Error(LEGACY_SUPABASE_ERROR);
    },
    apply() {
      throw new Error(LEGACY_SUPABASE_ERROR);
    },
  }
) as SupabaseClient;
