import {
  chromium,
  type BrowserContext,
  type FullConfig,
} from '@playwright/test';
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
import {
  ADMIN_AUTH_STATE_PATH,
  MEMBER_AUTH_STATE_PATH,
  getE2EAdminIdentity,
  getE2EMemberIdentity,
  type E2EIdentity,
} from './e2e-identities';
import { logInfo, logWarn } from '../../src/utils/logger';

dotenv.config({ path: '.env.local' });

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
};

function requiresDeterministicSeed(): boolean {
  return (
    process.env.CI === 'true' || process.env.PLAYWRIGHT_SUITE === 'critical'
  );
}

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

async function upsertAuthUser(
  admin: ReturnType<typeof createClient<any>>,
  identity: E2EIdentity
): Promise<void> {
  const app_metadata = { org_id: identity.orgId, role: identity.role };
  const existing = await findAuthUserByEmail(admin, identity.email);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: identity.password,
      email_confirm: true,
      app_metadata,
    });

    if (error) {
      throw new Error(
        `Could not update E2E ${identity.role} auth user: ${error.message}`
      );
    }

    logInfo('E2E auth user seed verified', 'PlaywrightGlobalSetup', {
      email: identity.email,
      userId: existing.id,
      orgId: identity.orgId,
      role: identity.role,
    });
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: identity.email,
    password: identity.password,
    email_confirm: true,
    app_metadata,
  });

  if (error) {
    throw new Error(
      `Could not create E2E ${identity.role} auth user: ${error.message}`
    );
  }

  logInfo('E2E auth user seed created', 'PlaywrightGlobalSetup', {
    email: identity.email,
    userId: data.user?.id,
    orgId: identity.orgId,
    role: identity.role,
  });
}

async function ensureTestSeed(env: SupabaseEnv): Promise<void> {
  const adminIdentity = getE2EAdminIdentity();
  const memberIdentity = getE2EMemberIdentity();

  if (!env.serviceRoleKey) {
    if (requiresDeterministicSeed()) {
      throw new Error(
        'CI/critical E2E requires SUPABASE_SERVICE_ROLE_KEY so test users and org membership can be seeded deterministically. Do not skip this setup.'
      );
    }

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
      id: adminIdentity.orgId,
      name: process.env.E2E_TEST_ORG_NAME || 'HC Violins and Bows',
    },
    { onConflict: 'id' }
  );

  if (orgError) {
    throw new Error(`Could not ensure E2E organization: ${orgError.message}`);
  }

  await upsertAuthUser(admin, adminIdentity);
  await upsertAuthUser(admin, memberIdentity);
}

async function signIn(
  env: SupabaseEnv,
  identity: E2EIdentity
): Promise<Session> {
  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });

  if (error || !data.session) {
    throw new Error(
      `Supabase sign-in failed for ${identity.email}: ${error?.message ?? 'missing session'}`
    );
  }

  const appMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  logInfo('Supabase sign-in succeeded for E2E user', 'PlaywrightGlobalSetup', {
    email: identity.email,
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

async function persistAuthenticatedState(options: {
  context: BrowserContext;
  baseURL: string;
  env: SupabaseEnv;
  identity: E2EIdentity;
  statePath: string;
  protectedApiPath: string;
}): Promise<void> {
  const { context, baseURL, env, identity, statePath, protectedApiPath } =
    options;

  const session = await signIn(env, identity);
  await context.addCookies(buildAuthCookies(baseURL, session));

  const page = await context.newPage();
  await page.goto('/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await assertCookieBackedAuth(page);
  const protectedApi = await validateProtectedApiAccess(page, protectedApiPath);

  if (protectedApi.status !== 200) {
    throw new Error(
      `Protected API auth validation failed for ${identity.role} ${identity.email}: status=${protectedApi.status}, body=${protectedApi.bodySnippet}`
    );
  }

  const cookieDiagnostics = await getCookieDiagnostics(context);
  logInfo('Cookie-backed E2E auth validated', 'PlaywrightGlobalSetup', {
    baseURL,
    email: identity.email,
    role: identity.role,
    cookieDiagnostics,
    protectedApiStatus: protectedApi.status,
    protectedApiPath,
  });

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  logInfo(`Authentication state saved to ${statePath}`);
}

async function globalSetup(config: FullConfig) {
  const baseURL = getBaseURL(config);
  const env = getSupabaseEnv();
  const browser = await chromium.launch();
  const adminContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });

  try {
    logInfo(
      'Preparing cookie-backed E2E auth session',
      'PlaywrightGlobalSetup',
      {
        baseURL,
        supabaseHost: new URL(env.url).host,
        email: getE2EAdminIdentity().email,
      }
    );

    await ensureTestSeed(env);

    await persistAuthenticatedState({
      context: adminContext,
      baseURL,
      env,
      identity: getE2EAdminIdentity(),
      statePath: ADMIN_AUTH_STATE_PATH,
      protectedApiPath: '/api/clients?limit=1',
    });

    if (env.serviceRoleKey || requiresDeterministicSeed()) {
      await persistAuthenticatedState({
        context: memberContext,
        baseURL,
        env,
        identity: getE2EMemberIdentity(),
        statePath: MEMBER_AUTH_STATE_PATH,
        protectedApiPath: '/api/sales?pageSize=1',
      });
    }
  } catch (error) {
    const cookieDiagnostics = await getCookieDiagnostics(adminContext).catch(
      diagnosticError => ({
        error:
          diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
      })
    );
    const protectedApi = await adminContext.request
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
      email: getE2EAdminIdentity().email,
      cookieDiagnostics,
      protectedApi,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  } finally {
    await adminContext.close().catch(() => undefined);
    await memberContext.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export default globalSetup;
