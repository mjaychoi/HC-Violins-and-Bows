/**
 * Reusable guard for staging-only Supabase / app mutations.
 * Never log secrets or full connection strings.
 *
 * Production project ref is an identifier (not a credential). It must be
 * supplied via PRODUCTION_SUPABASE_PROJECT_REF — never hard-coded here.
 */

export const PRODUCTION_SUPABASE_PROJECT_REF_ENV =
  'PRODUCTION_SUPABASE_PROJECT_REF';

/** Approved hosted staging ref; set via STAGING_SUPABASE_PROJECT_REF or STAGING_PROJECT_REF. */
export const STAGING_PROJECT_REF =
  process.env.STAGING_SUPABASE_PROJECT_REF?.trim().toLowerCase() ??
  process.env.STAGING_PROJECT_REF?.trim().toLowerCase() ??
  '';

const STATIC_PRODUCTION_HOST_PATTERNS = [
  /hc-violins-and-bows\.vercel\.app/i,
  /hcviolins/i,
];

/** Supabase project refs are lowercase alphanumeric identifiers. */
const PROJECT_REF_FORMAT = /^[a-z0-9]{10,32}$/;

export type StagingEnvironment = {
  environment: 'staging';
  approvedProjectRef: string;
  productionProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  appBaseUrl: string;
};

export type StagingGuardInput = Partial<{
  approvedProjectRef: string;
  productionProjectRef: string;
  supabaseUrl: string;
  /** Optional distinct public URL (NEXT_PUBLIC_SUPABASE_URL) for cross-checks. */
  publicSupabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  appBaseUrl: string;
}>;

/** Ambient env bag used by guards (avoids requiring full ProcessEnv in tests). */
export type EnvMap = Record<string, string | undefined>;

export type ResolveProductionProjectRefOptions = {
  /**
   * When the `value` key is present (including null/undefined), ambient env is
   * not consulted — prefer explicit arguments in unit tests.
   */
  value?: string | null;
  env?: EnvMap;
  /**
   * When true (default in hosted/CI), missing/empty values fail closed.
   */
  required?: boolean;
};

function fail(message: string): never {
  throw new Error(`Staging guard blocked: ${message}`);
}

export function isHostedCiMode(env: EnvMap = process.env): boolean {
  return env.CI === 'true' || env.CI === '1' || env.GITHUB_ACTIONS === 'true';
}

/**
 * Reject quote/newline corruption and normalize whitespace/case.
 * Does not accept empty results.
 */
export function normalizeProjectRefInput(
  raw: string | null | undefined,
  label: string
): string {
  if (raw == null) {
    fail(`${label} is missing.`);
  }

  if (/["'`\r\n]/.test(raw)) {
    fail(`${label} contains quote or newline corruption.`);
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    fail(`${label} is empty or whitespace-only.`);
  }

  return normalized;
}

export function assertValidProjectRefFormat(
  projectRef: string,
  label: string
): void {
  if (!PROJECT_REF_FORMAT.test(projectRef)) {
    fail(
      `${label} has malformed project-ref format (expected 10–32 lowercase alphanumeric characters).`
    );
  }
}

/**
 * Resolve the configured production project ref.
 * Never infers from production credentials or staging fallbacks.
 */
export function resolveProductionProjectRef(
  options: ResolveProductionProjectRefOptions = {}
): string | null {
  const env = options.env ?? process.env;
  const required = options.required ?? isHostedCiMode(env);
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(
    options,
    'value'
  );

  const raw = hasExplicitValue
    ? options.value
    : env[PRODUCTION_SUPABASE_PROJECT_REF_ENV];

  if (raw == null) {
    if (required) {
      fail(
        `${PRODUCTION_SUPABASE_PROJECT_REF_ENV} is required in hosted/CI mode (no hard-coded fallback).`
      );
    }
    return null;
  }

  const normalized = normalizeProjectRefInput(
    String(raw),
    PRODUCTION_SUPABASE_PROJECT_REF_ENV
  );
  assertValidProjectRefFormat(normalized, PRODUCTION_SUPABASE_PROJECT_REF_ENV);
  return normalized;
}

export function extractProjectRefFromSupabaseUrl(
  supabaseUrl: string
): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function extractProjectRefFromDatabaseUrl(
  databaseUrl: string
): string | null {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();

    const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct?.[1]) {
      return direct[1].toLowerCase();
    }

    const pooler = host.match(/^aws-0-[a-z0-9-]+\.pooler\.supabase\.com$/i);
    if (pooler) {
      const user = decodeURIComponent(parsed.username);
      const userMatch = user.match(/^postgres\.([a-z0-9]+)$/i);
      if (userMatch?.[1]) {
        return userMatch[1].toLowerCase();
      }
    }

    if (host === '127.0.0.1' || host === 'localhost') {
      return 'local';
    }

    return null;
  } catch {
    return null;
  }
}

function decodeJwtRef(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { ref?: string; iss?: string };

    if (typeof payload.ref === 'string' && payload.ref.length > 0) {
      return payload.ref.toLowerCase();
    }

    if (typeof payload.iss === 'string') {
      const issMatch = payload.iss.match(/\/project\/([a-z0-9]+)$/i);
      if (issMatch?.[1]) {
        return issMatch[1].toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

function assertNonProductionRef(
  projectRef: string | null,
  productionProjectRef: string,
  label: string
): void {
  if (!projectRef) {
    return;
  }

  if (projectRef === productionProjectRef) {
    fail(`${label} targets production project ref.`);
  }
}

function assertApprovedRef(
  actualRef: string | null,
  approvedRef: string,
  label: string
): void {
  if (!actualRef) {
    fail(`${label} project identity is missing or ambiguous.`);
  }

  if (actualRef !== approvedRef.toLowerCase()) {
    fail(
      `${label} project ref "${actualRef}" does not match approved staging ref "${approvedRef}".`
    );
  }
}

function assertNoStaticProductionHostPatterns(
  value: string,
  label: string
): void {
  for (const pattern of STATIC_PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(value)) {
      fail(`${label} matches production blocklist pattern.`);
    }
  }
}

function assertValueExcludesProductionRef(
  value: string,
  productionProjectRef: string,
  label: string
): void {
  if (value.toLowerCase().includes(productionProjectRef)) {
    fail(`${label} contains configured production project ref.`);
  }
}

/** True when `haystack` contains the project ref as a discrete identifier token. */
export function valueContainsProjectRef(
  haystack: string,
  projectRef: string
): boolean {
  return haystack.toLowerCase().includes(projectRef.toLowerCase());
}

function assertAppBaseUrlAllowed(
  appBaseUrl: string,
  approvedRef: string,
  productionProjectRef: string
): void {
  assertNoStaticProductionHostPatterns(appBaseUrl, 'Application base URL');
  assertValueExcludesProductionRef(
    appBaseUrl,
    productionProjectRef,
    'Application base URL'
  );

  let parsed: URL;
  try {
    parsed = new URL(appBaseUrl);
  } catch {
    fail('Application base URL is invalid.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local');

  if (isLocalhost) {
    return;
  }

  if (hostname.includes(approvedRef.toLowerCase())) {
    return;
  }

  if (/staging|preview|localhost/i.test(hostname)) {
    return;
  }

  fail(
    'Application base URL must be localhost or an approved staging/preview host.'
  );
}

export function assertStagingEnvironment(
  input: StagingGuardInput,
  options: { requireProductionProjectRef?: boolean } = {}
): StagingEnvironment {
  const requireProduction = options.requireProductionProjectRef ?? true;

  const productionProjectRef = resolveProductionProjectRef({
    value: input.productionProjectRef,
    required: requireProduction,
  });

  if (!productionProjectRef) {
    fail(
      `${PRODUCTION_SUPABASE_PROJECT_REF_ENV} is required (no hard-coded fallback).`
    );
  }

  let approvedProjectRef: string;
  try {
    approvedProjectRef = normalizeProjectRefInput(
      input.approvedProjectRef,
      'Approved staging project ref'
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /missing|empty or whitespace/i.test(error.message)
    ) {
      fail(
        'Required staging identity is incomplete. Set approved project ref, Supabase URL, anon key, service role key, DATABASE_URL, app base URL, and production project ref.'
      );
    }
    throw error;
  }

  assertValidProjectRefFormat(
    approvedProjectRef,
    'Approved staging project ref'
  );

  const supabaseUrl = input.supabaseUrl?.trim();
  const supabaseAnonKey = input.supabaseAnonKey?.trim();
  const serviceRoleKey = input.serviceRoleKey?.trim();
  const databaseUrl = input.databaseUrl?.trim();
  const appBaseUrl = input.appBaseUrl?.trim();
  const publicSupabaseUrl = input.publicSupabaseUrl?.trim();

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !serviceRoleKey ||
    !databaseUrl ||
    !appBaseUrl
  ) {
    fail(
      'Required staging identity is incomplete. Set approved project ref, Supabase URL, anon key, service role key, DATABASE_URL, app base URL, and production project ref.'
    );
  }

  if (approvedProjectRef === productionProjectRef) {
    fail(
      'Staging and production project refs must be distinct (staging ref cannot appear in the production slot).'
    );
  }

  assertNoStaticProductionHostPatterns(supabaseUrl, 'Supabase URL');
  assertNoStaticProductionHostPatterns(databaseUrl, 'DATABASE_URL');
  assertNoStaticProductionHostPatterns(appBaseUrl, 'Application base URL');

  assertValueExcludesProductionRef(
    supabaseUrl,
    productionProjectRef,
    'Supabase URL'
  );
  assertValueExcludesProductionRef(
    databaseUrl,
    productionProjectRef,
    'DATABASE_URL'
  );

  const urlRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
  const dbRef = extractProjectRefFromDatabaseUrl(databaseUrl);

  assertNonProductionRef(urlRef, productionProjectRef, 'Supabase URL');
  assertNonProductionRef(dbRef, productionProjectRef, 'DATABASE_URL');

  const isLocalTarget = urlRef === 'local' || dbRef === 'local';

  if (!isLocalTarget) {
    if (!urlRef) {
      fail('Supabase URL project identity is missing or ambiguous.');
    }
    if (!dbRef) {
      fail('DATABASE_URL project identity is missing or ambiguous.');
    }
  }

  if (urlRef && urlRef !== 'local') {
    assertApprovedRef(urlRef, approvedProjectRef, 'Supabase URL');
  }

  if (dbRef && dbRef !== 'local') {
    assertApprovedRef(dbRef, approvedProjectRef, 'DATABASE_URL');
  }

  if (
    urlRef &&
    dbRef &&
    urlRef !== 'local' &&
    dbRef !== 'local' &&
    urlRef !== dbRef
  ) {
    fail('Supabase URL project ref and DATABASE_URL project ref do not match.');
  }

  if (publicSupabaseUrl) {
    assertNoStaticProductionHostPatterns(
      publicSupabaseUrl,
      'NEXT_PUBLIC_SUPABASE_URL'
    );
    assertValueExcludesProductionRef(
      publicSupabaseUrl,
      productionProjectRef,
      'NEXT_PUBLIC_SUPABASE_URL'
    );
    const publicRef = extractProjectRefFromSupabaseUrl(publicSupabaseUrl);
    assertNonProductionRef(
      publicRef,
      productionProjectRef,
      'NEXT_PUBLIC_SUPABASE_URL'
    );
    if (publicRef && publicRef !== 'local') {
      assertApprovedRef(
        publicRef,
        approvedProjectRef,
        'NEXT_PUBLIC_SUPABASE_URL'
      );
    }
    if (
      urlRef &&
      publicRef &&
      urlRef !== 'local' &&
      publicRef !== 'local' &&
      urlRef !== publicRef
    ) {
      fail(
        'STAGING_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL project refs do not match.'
      );
    }
  }

  const serviceRoleRef = decodeJwtRef(serviceRoleKey);
  if (serviceRoleRef) {
    assertNonProductionRef(
      serviceRoleRef,
      productionProjectRef,
      'Service role key'
    );
    assertApprovedRef(serviceRoleRef, approvedProjectRef, 'Service role key');
  }

  assertAppBaseUrlAllowed(appBaseUrl, approvedProjectRef, productionProjectRef);

  return {
    environment: 'staging',
    approvedProjectRef,
    productionProjectRef,
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    databaseUrl,
    appBaseUrl,
  };
}

/**
 * Fail closed before seed/cleanup/mutation scripts touch a hosted project.
 * Requires PRODUCTION_SUPABASE_PROJECT_REF (explicit arg or env).
 */
export function assertUrlIsNotConfiguredProduction(
  url: string,
  productionProjectRef?: string | null
): string {
  const resolved = resolveProductionProjectRef({
    value: productionProjectRef,
    required: true,
  });

  if (!resolved) {
    fail(
      `${PRODUCTION_SUPABASE_PROJECT_REF_ENV} is required before mutating fixtures.`
    );
  }

  if (valueContainsProjectRef(url, resolved)) {
    fail('Refusing to operate on production Supabase project.');
  }

  return resolved;
}

export function loadStagingEnvironmentFromProcessEnv(
  env: EnvMap = process.env
): StagingEnvironment {
  const stagingUrl = env.STAGING_SUPABASE_URL;
  const publicUrl = env.NEXT_PUBLIC_SUPABASE_URL;

  return assertStagingEnvironment(
    {
      approvedProjectRef:
        env.STAGING_SUPABASE_PROJECT_REF ?? env.STAGING_PROJECT_REF,
      productionProjectRef: env[PRODUCTION_SUPABASE_PROJECT_REF_ENV],
      supabaseUrl: stagingUrl ?? publicUrl,
      // Cross-check when both are present so mismatched public/staging refs fail closed.
      publicSupabaseUrl: stagingUrl && publicUrl ? publicUrl : undefined,
      supabaseAnonKey:
        env.STAGING_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey:
        env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
      databaseUrl: env.STAGING_DATABASE_URL ?? env.DATABASE_URL,
      appBaseUrl: env.STAGING_APP_BASE_URL ?? env.AUTH_MATRIX_BASE_URL,
    },
    {
      requireProductionProjectRef: true,
    }
  );
}
