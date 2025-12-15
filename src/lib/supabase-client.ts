/**
 * Client-side Supabase helper
 * Use this in client components instead of direct import from supabase.ts
 * FIXED: Use static import and synchronous initialization to avoid webpack module loading issues
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client synchronously (called once at module load)
 * This ensures the client is available immediately without async overhead
 */
function initializeSupabaseClient(): SupabaseClient | null {
  if (_supabase) {
    return _supabase;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Don't throw during module initialization - return null and let callers handle it
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
    _supabase = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // FIXED: Add better error handling for network failures
        detectSessionInUrl: false, // Disable URL-based session detection to avoid fetch errors
      },
      // FIXED: Add global fetch options for better error handling
      global: {
        fetch: (url, options = {}) => {
          // Create abort controller for timeout
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 30000);

          return fetch(url, {
            ...options,
            signal: abortController.signal,
          })
            .then(response => {
              clearTimeout(timeoutId);
              return response;
            })
            .catch(error => {
              clearTimeout(timeoutId);
              // Log network errors but don't throw - let the app continue
              if (
                typeof window !== 'undefined' &&
                error.name !== 'AbortError'
              ) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                if (
                  errorMessage.includes('fetch') ||
                  errorMessage.includes('network')
                ) {
                  console.warn(
                    'Supabase network request failed. This may be due to:',
                    {
                      message: errorMessage,
                      url: typeof url === 'string' ? url : 'unknown',
                      possibleCauses: [
                        'No internet connection',
                        'Supabase service unavailable',
                        'Incorrect Supabase URL',
                        'CORS configuration issue',
                      ],
                    }
                  );
                }
              }
              throw error;
            });
        },
      },
    });
    return _supabase;
  } catch (error) {
    if (typeof window !== 'undefined') {
      console.error('Failed to initialize Supabase client:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        console.warn(
          'Network error during Supabase initialization. Check your internet connection and Supabase URL.'
        );
      }
    }
    return null;
  }
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  initializeSupabaseClient();
}

/**
 * Get or create Supabase client instance
 * Returns a Promise for backward compatibility, but actually resolves synchronously
 * Throws error if required environment variables are missing
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (_supabase) {
    return _supabase;
  }

  const client = initializeSupabaseClient();
  if (!client) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return client;
}

/**
 * Get Supabase client synchronously (for cases where async is not needed)
 * Returns null if not initialized or environment variables are missing
 */
export function getSupabaseClientSync(): SupabaseClient | null {
  if (_supabase) {
    return _supabase;
  }
  return initializeSupabaseClient();
}
