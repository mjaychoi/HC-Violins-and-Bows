import { chromium, type FullConfig } from '@playwright/test';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { serializeSupabaseAuthCookieChunks } from '../../src/lib/supabase-auth-cookie';
import {
  assertCookieBackedAuth,
  getCookieDiagnostics,
  validateProtectedApiAccess,
} from './test-helpers';
import { logInfo, logWarn } from '../../src/utils/logger';

dotenv.config({ path: '.env.local' });

const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');
const DEFAULT_E2E_ORG_ID = '00000000-0000-4000-8000-0000000000e2';

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
};

function getBaseURL(config: FullConfig): string {
  const configured =
    process.env.PLAYWRIGHT_BASE_URL ||
    String(config.projects[0]?.use?.baseURL || '').trim();

  return configured || 'http://localhost:3000';
}

function getSupabaseEnv(): SupabaseEnv {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      'E2E auth setup requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function getTestIdentity() {
  return {
    email: process.env.E2E_TEST_EMAIL || 'test@test.com',
    password: process.env.E2E_TEST_PASSWORD || 'test123',
    orgId: process.env.E2E_TEST_ORG_ID || DEFAULT_E2E_ORG_ID,
  };
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient<any>>,
  email: string
): Promise<User | null> {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`Could not list Supabase users: ${error.message}`);
    }

    const match = data.users.find(
      user => user.email?.toLowerCase() === email.toLowerCase()
    );
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }

  throw new Error('Could not find E2E auth user within first 20 pages.');
}

async function ensureTestSeed(env: SupabaseEnv): Promise<void> {
  const { email, password, orgId } = getTestIdentity();

  if (!env.serviceRoleKey) {
    logWarn(
      'SUPABASE_SERVICE_ROLE_KEY is not set; skipping deterministic E2E user seed and using existing credentials.'
    );
    return;
  }

  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: orgError } = await admin.from('organizations').upsert(
    {
      id: orgId,
      name: process.env.E2E_TEST_ORG_NAME || 'HC Violins and Bows',
    },
    { onConflict: 'id' }
  );

  if (orgError) {
    throw new Error(`Could not ensure E2E organization: ${orgError.message}`);
  }

  const app_metadata = { org_id: orgId, role: 'admin' as const };
  const existing = await findAuthUserByEmail(admin, email);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata,
    });

    if (error) {
      throw new Error(`Could not update E2E auth user: ${error.message}`);
    }

    logInfo('E2E auth user seed verified', 'PlaywrightGlobalSetup', {
      email,
      userId: existing.id,
      orgId,
      role: app_metadata.role,
    });
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata,
  });

  if (error) {
    throw new Error(`Could not create E2E auth user: ${error.message}`);
  }

  logInfo('E2E auth user seed created', 'PlaywrightGlobalSetup', {
    email,
    userId: data.user?.id,
    orgId,
    role: app_metadata.role,
  });
}

async function signIn(env: SupabaseEnv): Promise<Session> {
  const { email, password } = getTestIdentity();
  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(
      `Supabase sign-in failed for ${email}: ${error?.message ?? 'missing session'}`
    );
  }

  const appMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  logInfo('Supabase sign-in succeeded for E2E user', 'PlaywrightGlobalSetup', {
    email,
    userId: data.user.id,
    orgId: typeof appMeta.org_id === 'string' ? appMeta.org_id : null,
    role: typeof appMeta.role === 'string' ? appMeta.role : null,
  });

  return data.session;
}

function buildAuthCookies(baseURL: string, session: Session) {
  const parsed = new URL(baseURL);
  const expires = session.expires_at
    ? Math.max(session.expires_at, Math.floor(Date.now() / 1000) + 60)
    : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

  return serializeSupabaseAuthCookieChunks(JSON.stringify(session)).map(
    cookie => ({
      name: cookie.name,
      value: cookie.value,
      url: parsed.origin,
      expires,
      httpOnly: false,
      secure: parsed.protocol === 'https:',
      sameSite: 'Lax' as const,
    })
  );
}

async function globalSetup(config: FullConfig) {
  const baseURL = getBaseURL(config);
  const env = getSupabaseEnv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });

  try {
    logInfo(
      'Preparing cookie-backed E2E auth session',
      'PlaywrightGlobalSetup',
      {
        baseURL,
        supabaseHost: new URL(env.url).host,
        email: getTestIdentity().email,
      }
    );

    await ensureTestSeed(env);

    const session = await signIn(env);
    const authCookies = buildAuthCookies(baseURL, session);
    await context.addCookies(authCookies);

    const page = await context.newPage();
    await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await assertCookieBackedAuth(page);
    const protectedApi = await validateProtectedApiAccess(
      page,
      '/api/clients?limit=1'
    );

    if (protectedApi.status !== 200) {
      throw new Error(
        `Protected API auth validation failed: status=${protectedApi.status}, body=${protectedApi.bodySnippet}`
      );
    }

    const cookieDiagnostics = await getCookieDiagnostics(context);
    logInfo('Cookie-backed E2E auth validated', 'PlaywrightGlobalSetup', {
      baseURL,
      cookieDiagnostics,
      protectedApiStatus: protectedApi.status,
    });

    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    logInfo(`Authentication state saved to ${AUTH_STATE_PATH}`);
  } catch (error) {
    const cookieDiagnostics = await getCookieDiagnostics(context).catch(
      diagnosticError => ({
        error:
          diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
      })
    );
    const protectedApi = await context.request
      .get(`${baseURL}/api/clients?limit=1`)
      .then(async response => ({
        status: response.status(),
        bodySnippet: (await response.text()).slice(0, 300),
      }))
      .catch(apiError => ({
        status: null,
        bodySnippet:
          apiError instanceof Error ? apiError.message : String(apiError),
      }));

    logWarn('E2E auth setup failed', 'PlaywrightGlobalSetup', {
      baseURL,
      supabaseHost: new URL(env.url).host,
      email: getTestIdentity().email,
      cookieDiagnostics,
      protectedApi,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export default globalSetup;
