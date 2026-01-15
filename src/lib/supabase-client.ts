/**
 * Client-side Supabase helper
 * Use this in client components instead of direct import from supabase.ts
 * - Single cached client instance
 * - Safe initialization (returns null if env missing)
 * - Typed with Database to avoid GenericStringError inference
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let _client: SupabaseClient<Database> | null = null;

/**
 * Initialize Supabase client synchronously.
 * Returns null if env vars are missing or URL is invalid.
 */
function initializeSupabaseClient(): SupabaseClient<Database> | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Don't throw during module initialization - let callers handle it.
    if (typeof window !== 'undefined') {
      console.error(
        '❌ Supabase environment variables not set!\n' +
          'Please check your .env.local file and ensure the following variables are set:\n' +
          '  - NEXT_PUBLIC_SUPABASE_URL\n' +
          '  - NEXT_PUBLIC_SUPABASE_ANON_KEY\n\n' +
          'Some features may not work without these variables.'
      );
    }
    return null;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    if (typeof window !== 'undefined') {
      console.error(
        `❌ Invalid Supabase URL format: ${url}\n` +
          'Please check your NEXT_PUBLIC_SUPABASE_URL environment variable.'
      );
    }
    return null;
  }

  try {
    _client = createClient<Database>(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => {
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 30_000);

          return fetch(input, {
            ...(init ?? {}),
            signal: abortController.signal,
          })
            .then(response => {
              clearTimeout(timeoutId);
              return response;
            })
            .catch(error => {
              clearTimeout(timeoutId);

              // Log network-ish errors (but still rethrow so callers can handle)
              if (
                typeof window !== 'undefined' &&
                error?.name !== 'AbortError'
              ) {
                const msg =
                  error instanceof Error ? error.message : String(error);
                if (
                  msg.toLowerCase().includes('fetch') ||
                  msg.toLowerCase().includes('network')
                ) {
                  console.warn('Supabase network request failed.', {
                    message: msg,
                    possibleCauses: [
                      'No internet connection',
                      'Supabase service unavailable',
                      'Incorrect Supabase URL',
                      'CORS configuration issue',
                    ],
                  });
                }
              }

              throw error;
            });
        },
      },
    });

    return _client;
  } catch (error) {
    if (typeof window !== 'undefined') {
      console.error('Failed to initialize Supabase client:', error);
    }
    _client = null;
    return null;
  }
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  initializeSupabaseClient();
}

/**
 * Get Supabase client (typed) or throw if env vars are missing.
 * Use this when the app cannot operate without Supabase.
 */
export async function getSupabaseClient(): Promise<SupabaseClient<Database>> {
  const client = initializeSupabaseClient();
  if (!client) {
    throw new Error('Missing Supabase environment variables');
  }
  return client;
}

/**
 * Get Supabase client synchronously (typed).
 * Returns null if not initialized or env vars are missing/invalid.
 */
export function getSupabaseClientSync(): SupabaseClient<Database> | null {
  return initializeSupabaseClient();
}
