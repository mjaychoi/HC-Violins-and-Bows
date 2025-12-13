/**
 * Client-side Supabase helper with dynamic import
 * This file uses dynamic import to avoid HMR issues with Turbopack
 * Use this in client components instead of direct import from supabase.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
let _supabaseModule: typeof import('@supabase/supabase-js') | null = null;

/**
 * Get or create Supabase client instance (async for client components)
 * Throws error if required environment variables are missing
 * Uses dynamic import to avoid HMR issues with Turbopack
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (_supabase) {
    return _supabase;
  }

  // Dynamic import to avoid HMR issues with Turbopack
  if (!_supabaseModule) {
    _supabaseModule = await import('@supabase/supabase-js');
  }

  const { createClient } = _supabaseModule;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  return _supabase;
}
