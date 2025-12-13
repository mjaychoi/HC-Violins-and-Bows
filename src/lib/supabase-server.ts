import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using service role key
 * This bypasses RLS policies and should only be used in API routes
 */
let _serverSupabase: SupabaseClient | null = null;

/**
 * Get or create server-side Supabase client instance (service role)
 * Throws error if required environment variables are missing
 */
export function getServerSupabase(): SupabaseClient {
  if (_serverSupabase) {
    return _serverSupabase;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'
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
