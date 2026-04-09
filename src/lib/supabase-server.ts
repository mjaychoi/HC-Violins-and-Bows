import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  readSupabaseAuthSession,
  SUPABASE_AUTH_STORAGE_KEY,
} from '@/lib/supabase-auth-cookie';

type AppSupabaseClient = SupabaseClient<Database>;

type CookieStoreLike = {
  getAll(): Array<{ name: string; value: string }>;
};

export interface CookieBackedAuthResult {
  accessToken: string;
  user: User;
  userSupabase: AppSupabaseClient;
}

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

export function getUserSupabase(accessToken: string): AppSupabaseClient {
  if (!accessToken?.trim()) {
    throw new Error('getUserSupabase requires a non-empty access token');
  }

  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
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

export function getAccessTokenFromCookies(
  cookies: CookieStoreLike,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): string | null {
  const session = readSupabaseAuthSession(cookies, storageKey);
  return session?.access_token?.trim() || null;
}

export async function getCookieBackedAuth(
  cookies: CookieStoreLike,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): Promise<CookieBackedAuthResult | null> {
  const accessToken = getAccessTokenFromCookies(cookies, storageKey);
  if (!accessToken) {
    return null;
  }

  const userSupabase = getUserSupabase(accessToken);
  const {
    data: { user },
    error,
  } = await userSupabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    accessToken,
    user,
    userSupabase,
  };
}

let _adminSupabase: AppSupabaseClient | null = null;

export function getAdminSupabase(): AppSupabaseClient {
  if (_adminSupabase) {
    return _adminSupabase;
  }

  _adminSupabase = createClient<Database>(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  return _adminSupabase;
}
