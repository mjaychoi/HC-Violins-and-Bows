/**
 * Helper function to make authenticated API requests
 * Automatically includes Supabase access token in Authorization header
 */

import { getSupabaseClient } from '@/lib/supabase-client';

type ApiFetchMeta = {
  idempotencyKey?: string;
};

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
  const requestOptions: RequestInit = {
    ...options,
  };

  if (meta?.idempotencyKey) {
    const idempotencyHeaders = new Headers(requestOptions.headers);
    idempotencyHeaders.set('Idempotency-Key', meta.idempotencyKey);
    requestOptions.headers = idempotencyHeaders;
  }

  try {
    // Get Supabase client to access session
    const supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Prepare headers
    const headers = new Headers(requestOptions.headers);

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

    const fetchOptions: RequestInit = { ...requestOptions };

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
    return fetch(url, requestOptions);
  }
}
