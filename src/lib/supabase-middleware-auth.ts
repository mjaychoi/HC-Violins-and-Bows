/**
 * Edge-safe cookie session probe for page middleware.
 *
 * Intentionally does NOT import `@/lib/supabase-server` so the middleware
 * graph never pulls service-role / admin clients.
 */
import { createClient } from '@supabase/supabase-js';
import {
  readSupabaseAuthSession,
  SUPABASE_AUTH_STORAGE_KEY,
} from '@/lib/supabase-auth-cookie';

type CookieStoreLike = {
  getAll(): Array<{ name: string; value: string }>;
};

export type MiddlewareCookieAuth = {
  accessToken: string;
  userId: string;
};

function getPublicSupabaseUrl(): string | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url?.trim() || null;
}

function getPublicSupabaseAnonKey(): string | null {
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return anonKey?.trim() || null;
}

export function getAccessTokenFromCookies(
  cookies: CookieStoreLike,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): string | null {
  const session = readSupabaseAuthSession(cookies, storageKey);
  return session?.access_token?.trim() || null;
}

/**
 * Returns authenticated identity when the cookie-backed access token is valid.
 * Fail-closed: missing env, malformed cookies, or invalid/expired tokens → null.
 * Never throws into the middleware request path.
 */
export async function getMiddlewareCookieAuth(
  cookies: CookieStoreLike,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): Promise<MiddlewareCookieAuth | null> {
  try {
    const accessToken = getAccessTokenFromCookies(cookies, storageKey);
    if (!accessToken) {
      return null;
    }

    const url = getPublicSupabaseUrl();
    const anonKey = getPublicSupabaseAnonKey();
    if (!url || !anonKey) {
      return null;
    }

    const userSupabase = createClient(url, anonKey, {
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

    const {
      data: { user },
      error,
    } = await userSupabase.auth.getUser(accessToken);

    if (error || !user?.id) {
      return null;
    }

    return {
      accessToken,
      userId: user.id,
    };
  } catch {
    return null;
  }
}
