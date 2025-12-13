import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazy singleton pattern for Supabase client
 * This ensures the client is created only when env vars are available,
 * preventing placeholder client from persisting to production runtime.
 */
let _supabase: SupabaseClient | null = null;

/**
 * Get or create Supabase client instance
 * Throws error if required environment variables are missing
 */
export function getSupabase(): SupabaseClient {
  if (_supabase) {
    return _supabase;
  }

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

/**
 * @deprecated Use getSupabase() instead for lazy initialization
 * Kept for backward compatibility - using lazy getter to reduce initial bundle size
 * This defers the Supabase SDK import until actually used
 * Note: This is now async-compatible but may cause issues in sync contexts
 */
let _supabaseInstance: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseInstance) {
      // For sync access, try to use existing instance or throw
      if (!_supabase) {
        throw new Error(
          'Supabase client accessed synchronously before initialization. Use async getSupabase() or await initialization.'
        );
      }
      _supabaseInstance = _supabase;
    }
    const value = (_supabaseInstance as unknown as Record<string, unknown>)[
      prop as string
    ];
    if (typeof value === 'function') {
      return value.bind(_supabaseInstance);
    }
    return value;
  },
}) as SupabaseClient;
