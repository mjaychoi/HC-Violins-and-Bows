import { createClient } from '@supabase/supabase-js';

import { serializeSupabaseAuthCookieChunks } from '../../src/lib/supabase-auth-cookie';
import type { E2EIdentity } from './e2e-identities';

export type FreshSessionStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Lax';
  }>;
  origins: [];
};

async function signInStorageState(
  baseURL: string,
  identity: E2EIdentity
): Promise<FreshSessionStorageState> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      'Fresh E2E session requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });
  if (error || !data.session) {
    throw new Error(
      `Fresh E2E ${identity.role} sign-in failed: ${error?.message ?? 'missing session'}`
    );
  }

  const origin = new URL(baseURL);
  const expires =
    data.session.expires_at ?? Math.floor(Date.now() / 1000) + 60 * 60;
  return {
    cookies: serializeSupabaseAuthCookieChunks(
      JSON.stringify(data.session)
    ).map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: origin.hostname,
      path: '/',
      expires,
      httpOnly: false,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax' as const,
    })),
    origins: [],
  };
}

/**
 * Lazily signs `identity` in to a brand-new Supabase session, once per call
 * site. Call it at the top of a spec file and pass the result to
 * `test.use({ storageState })`:
 *
 *   const adminState = freshSessionStorageState(getE2EAdminIdentity());
 *   test.use({
 *     storageState: async ({ baseURL }, provide) =>
 *       provide(await adminState(baseURL)),
 *   });
 *
 * The memo is per call site (not module-global), so each caller explicitly
 * owns the fresh session state it requests while repeated fixture setup for
 * that caller reuses one sign-in. This is useful when a spec should not
 * depend on a persisted shared auth-state file and keeps sign-ins well under
 * the Supabase auth rate limit.
 */
export function freshSessionStorageState(
  identity: E2EIdentity
): (baseURL: string | undefined) => Promise<FreshSessionStorageState> {
  let pending: Promise<FreshSessionStorageState> | null = null;
  return baseURL => {
    if (!baseURL) {
      throw new Error('Fresh E2E session requires a Playwright baseURL.');
    }
    if (!pending) {
      pending = signInStorageState(baseURL, identity).catch(error => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
