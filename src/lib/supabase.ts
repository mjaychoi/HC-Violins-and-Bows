import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

/**
 * FIXED: Unified Supabase client access
 * This file now delegates to supabase-client.ts to ensure single instance
 * All Supabase client creation goes through supabase-client.ts
 * This prevents "Multiple GoTrueClient instances" warning
 */

/**
 * Get or create Supabase client instance (async)
 * Delegates to getSupabaseClient() to ensure single instance across the app
 * Throws error if required environment variables are missing
 */
export async function getSupabase(): Promise<SupabaseClient> {
  return getSupabaseClient();
}

/**
 * @deprecated Use getSupabaseClient() directly instead
 * Kept for backward compatibility only - this Proxy will throw on first access
 * For new code, use async getSupabase() or getSupabaseClient() directly
 */
let _supabaseProxyInstance: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseProxyInstance) {
      // Try to initialize asynchronously, but throw for sync access
      getSupabaseClient()
        .then(client => {
          _supabaseProxyInstance = client;
        })
        .catch(() => {
          // Ignore - will be initialized on first use
        });
      throw new Error(
        'Supabase client accessed synchronously before initialization. Use async getSupabase() or getSupabaseClient() instead.'
      );
    }
    const value = (
      _supabaseProxyInstance as unknown as Record<string, unknown>
    )[prop as string];
    if (typeof value === 'function') {
      return value.bind(_supabaseProxyInstance);
    }
    return value;
  },
}) as SupabaseClient;
