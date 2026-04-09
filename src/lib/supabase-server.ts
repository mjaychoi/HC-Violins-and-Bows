import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'Missing Supabase URL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'
    );
  }
  return url;
}

function getSupabaseAnonKey(): string {
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      'Missing Supabase anon key: SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  return anonKey;
}

function getSupabaseServiceRoleKey(): string {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return serviceRoleKey;
}

/**
 * User-scoped Supabase client.
 *
 * Uses the caller's access token, so RLS and user/session policies still apply.
 * This should be the DEFAULT client for authenticated API routes.
 */
export function getUserSupabase(accessToken: string): SupabaseClient {
  if (!accessToken?.trim()) {
    throw new Error('getUserSupabase requires a non-empty access token');
  }

  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Admin/service-role Supabase client.
 *
 * WARNING:
 * - Bypasses RLS
 * - Should ONLY be used for truly privileged server-side operations
 * - Never use as the default route client for normal CRUD
 */
let _adminSupabase: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (_adminSupabase) {
    return _adminSupabase;
  }

  _adminSupabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _adminSupabase;
}
