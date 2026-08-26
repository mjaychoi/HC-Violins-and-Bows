import { assertE2EStagingProjectAllowlist } from '../assert-e2e-staging-project-allowlist';
import {
  extractProjectRefFromSupabaseUrl,
  normalizeProjectRefInput,
  type EnvMap,
} from '../staging/env-guard';

const PRODUCTION_HOST_PATTERNS = [
  /hc-violins-and-bows\.vercel\.app/i,
  /hcviolins/i,
];

export class PostDeploySafetyError extends Error {
  readonly code = 'POSTDEPLOY_SAFETY';

  constructor(message: string) {
    super(message);
    this.name = 'PostDeploySafetyError';
  }
}

function fail(message: string): never {
  throw new PostDeploySafetyError(message);
}

function readFirst(env: EnvMap, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export function resolvePostDeployBaseUrl(env: EnvMap): string {
  return readFirst(env, ['POSTDEPLOY_BASE_URL', 'STAGING_APP_BASE_URL']);
}

export function resolveSyntheticEmail(env: EnvMap): string {
  return readFirst(env, ['SYNTHETIC_EMAIL', 'E2E_TEST_EMAIL']);
}

export function resolveSyntheticPassword(env: EnvMap): string {
  return readFirst(env, ['SYNTHETIC_PASSWORD', 'E2E_TEST_PASSWORD']);
}

export function resolveSyntheticSupabaseUrl(env: EnvMap): string {
  return readFirst(env, [
    'STAGING_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
  ]);
}

export function resolveSyntheticSupabaseAnonKey(env: EnvMap): string {
  return readFirst(env, [
    'STAGING_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  ]);
}

export function assertSyntheticCredentialsPresent(env: EnvMap): {
  email: string;
  password: string;
  supabaseUrl: string;
  anonKey: string;
} {
  const email = resolveSyntheticEmail(env);
  const password = resolveSyntheticPassword(env);
  const supabaseUrl = resolveSyntheticSupabaseUrl(env);
  const anonKey = resolveSyntheticSupabaseAnonKey(env);
  const missing: string[] = [];

  if (!email) missing.push('SYNTHETIC_EMAIL');
  if (!password) missing.push('SYNTHETIC_PASSWORD');
  if (!supabaseUrl) missing.push('STAGING_SUPABASE_URL');
  if (!anonKey) missing.push('STAGING_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    fail(`Missing required synthetic credentials: ${missing.join(', ')}.`);
  }

  return { email, password, supabaseUrl, anonKey };
}

function originsMatch(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  );
}

export function assertPostDeployTargetAllowlisted(env: EnvMap): {
  baseUrl: string;
} {
  const baseUrl = resolvePostDeployBaseUrl(env);
  if (!baseUrl) {
    fail('POSTDEPLOY_BASE_URL is missing.');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    fail('POSTDEPLOY_BASE_URL is invalid.');
  }

  if (parsed.protocol !== 'https:' && !isLocalHost(parsed.hostname)) {
    fail('POSTDEPLOY_BASE_URL must be https except for localhost.');
  }

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(baseUrl)) {
      fail('POSTDEPLOY_BASE_URL matches a production host pattern.');
    }
  }

  const stagingAppBaseUrl = env.STAGING_APP_BASE_URL?.trim();
  if (stagingAppBaseUrl && !originsMatch(baseUrl, stagingAppBaseUrl)) {
    fail('POSTDEPLOY_BASE_URL does not match STAGING_APP_BASE_URL.');
  }

  const supabaseUrl = resolveSyntheticSupabaseUrl(env);
  const allowlistEnv: EnvMap = {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
    SUPABASE_URL: env.SUPABASE_URL || supabaseUrl,
  };

  assertE2EStagingProjectAllowlist(allowlistEnv);

  const productionRefRaw = env.PRODUCTION_SUPABASE_PROJECT_REF;
  if (productionRefRaw != null && String(productionRefRaw).trim() !== '') {
    const productionRef = normalizeProjectRefInput(
      String(productionRefRaw),
      'PRODUCTION_SUPABASE_PROJECT_REF'
    );
    if (baseUrl.toLowerCase().includes(productionRef)) {
      fail(
        'POSTDEPLOY_BASE_URL contains the configured production project ref.'
      );
    }

    const actualRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
    if (actualRef === productionRef) {
      fail(
        'Post-deploy synthetic must not target the production Supabase project.'
      );
    }
  }

  if (env.POSTDEPLOY_ALLOW_PRODUCTION === 'true') {
    fail('Production synthetic writes are not enabled in this implementation.');
  }

  return { baseUrl: parsed.origin };
}
