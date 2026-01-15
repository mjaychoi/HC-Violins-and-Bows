/**
 * Helper function to make authenticated API requests
 * Automatically includes Supabase access token in Authorization header
 */

import { getSupabaseClient } from '@/lib/supabase-client';
import type { Session } from '@supabase/supabase-js';

type ApiFetchMeta = {
  idempotencyKey?: string;
};

const SESSION_CACHE_TTL = 5_000;
let cachedSession: Session | null = null;
let cachedSessionExpiresAt = 0;
let cachedSessionPromise: Promise<Session | null> | null = null;

async function getCachedSession(): Promise<Session | null> {
  const now = Date.now();
  if (cachedSession && now < cachedSessionExpiresAt) {
    return cachedSession;
  }

  if (!cachedSessionPromise) {
    cachedSessionPromise = (async () => {
      const supabase = await getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session ?? null;
    })();
  }

  try {
    const session = await cachedSessionPromise;
    cachedSession = session;
    cachedSessionExpiresAt = Date.now() + SESSION_CACHE_TTL;
    return session;
  } finally {
    cachedSessionPromise = null;
  }
}

/**
 * Fetch with automatic authentication token injection
 * @param url - API endpoint URL
 * @param options - Fetch options (headers will be merged with auth header)
 * @param meta - Optional metadata (e.g., idempotency keys)
 * @returns Promise<Response>
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
  meta?: ApiFetchMeta
): Promise<Response> {
  // Start from caller-provided options
  const requestOptions: RequestInit = { ...options };

  // Apply idempotency key if provided
  if (meta?.idempotencyKey) {
    const h = new Headers(requestOptions.headers);
    h.set('Idempotency-Key', meta.idempotencyKey);
    requestOptions.headers = h;
  }

  // Prepare fetchOptions in outer scope so catch can use it
  const fetchOptions: RequestInit = { ...requestOptions };

  try {
    const session = await getCachedSession();

    // Merge headers
    const headers = new Headers(fetchOptions.headers);

    // Add Authorization header if session exists
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }

    // Normalize headers into a plain object for easier testing/inspection
    const canonicalHeaderNames: Record<string, string> = {
      'content-type': 'Content-Type',
      authorization: 'Authorization',
    };

    const normalizedHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      const canonicalKey = canonicalHeaderNames[key] ?? key;
      normalizedHeaders[canonicalKey] = value;
    });

    if (Object.keys(normalizedHeaders).length > 0) {
      fetchOptions.headers = normalizedHeaders;
    } else {
      delete fetchOptions.headers;
    }

    const hasOptions = Object.keys(fetchOptions).length > 0;
    return hasOptions ? fetch(url, fetchOptions) : fetch(url);
  } catch (error) {
    // If getting session fails, try fetch without auth (for public endpoints)
    console.warn(
      'Failed to get session for API fetch, attempting without auth:',
      error
    );

    const hasOptions = Object.keys(fetchOptions).length > 0;
    return hasOptions ? fetch(url, fetchOptions) : fetch(url);
  }
}
