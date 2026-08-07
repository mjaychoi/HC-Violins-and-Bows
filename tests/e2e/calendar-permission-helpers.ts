import { type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { serializeSupabaseAuthCookieChunks } from '../../src/lib/supabase-auth-cookie';

/**
 * Isolated auth helper for a non-admin ("member") E2E session, used only by
 * calendar permission tests. Deliberately kept separate from
 * tests/e2e/global-setup.ts (which seeds the single admin storageState shared
 * by every other spec) so this doesn't change auth behavior for the rest of
 * the suite. Mirrors the same cookie-based sign-in global-setup.ts performs,
 * scoped to one throwaway browser context.
 */

const DEFAULT_E2E_ORG_ID = '00000000-0000-4000-8000-0000000000e2';

export function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export function getMemberIdentity() {
  return {
    email: process.env.E2E_MEMBER_TEST_EMAIL || 'test-member@test.com',
    password: process.env.E2E_MEMBER_TEST_PASSWORD || 'test123',
    orgId: process.env.E2E_TEST_ORG_ID || DEFAULT_E2E_ORG_ID,
  };
}

async function ensureMemberSeed(
  env: NonNullable<ReturnType<typeof getSupabaseEnv>>
): Promise<void> {
  const { email, password, orgId } = getMemberIdentity();

  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const app_metadata = { org_id: orgId, role: 'member' as const };

  let page = 1;
  let existingId: string | null = null;
  while (page <= 20 && !existingId) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error)
      throw new Error(`Could not list Supabase users: ${error.message}`);
    const match = data.users.find(
      user => user.email?.toLowerCase() === email.toLowerCase()
    );
    if (match) existingId = match.id;
    if (data.users.length < 1000) break;
    page += 1;
  }

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      app_metadata,
    });
    if (error)
      throw new Error(`Could not update E2E member user: ${error.message}`);
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata,
  });
  if (error)
    throw new Error(`Could not create E2E member user: ${error.message}`);
}

/**
 * Returns a Page authenticated as a non-admin ("member") user in the same
 * E2E org as the default admin storageState, or null if the service role key
 * isn't configured (e.g. local runs without seed permissions) — callers
 * should test.skip() in that case rather than fail.
 */
export async function createNonAdminPage(
  browser: Browser,
  baseURL: string
): Promise<Page | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  const { email, password } = getMemberIdentity();

  await ensureMemberSeed(env);

  const anonClient = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return null;

  const parsed = new URL(baseURL);
  const expires = data.session.expires_at
    ? Math.max(data.session.expires_at, Math.floor(Date.now() / 1000) + 60)
    : Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  const context = await browser.newContext({ baseURL });
  await context.addCookies(
    serializeSupabaseAuthCookieChunks(JSON.stringify(data.session)).map(
      cookie => ({
        name: cookie.name,
        value: cookie.value,
        url: parsed.origin,
        expires,
        httpOnly: false,
        secure: parsed.protocol === 'https:',
        sameSite: 'Lax' as const,
      })
    )
  );

  return context.newPage();
}
