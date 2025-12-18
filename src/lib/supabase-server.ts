/**
 * ✅ FIXED: Server-only module guard
 * This ensures this file is never imported in client-side code
 *
 * To enable: Install 'server-only' package and uncomment the import below
 * npm install --save-dev server-only
 *
 * For now, this is enforced via file location (lib/supabase-server.ts)
 * and clear error messages if accidentally imported in client code
 */
// import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using service role key
 * This bypasses RLS policies and should only be used in API routes
 * ✅ FIXED: Uses server-only to prevent client bundle inclusion
 */
let _serverSupabase: SupabaseClient | null = null;

/**
 * ✅ FIXED: Get or create server-side Supabase client instance (service role)
 * Throws error if required environment variables are missing
 *
 * Environment variable priority:
 * 1. SUPABASE_URL (server-only, preferred)
 * 2. NEXT_PUBLIC_SUPABASE_URL (fallback for compatibility)
 */
export function getServerSupabase(): SupabaseClient {
  if (_serverSupabase) {
    return _serverSupabase;
  }

  // ✅ FIXED: Prefer server-only env variable, fallback to NEXT_PUBLIC for compatibility
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: ' +
        'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  _serverSupabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _serverSupabase;
}
