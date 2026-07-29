/**
 * Reusable guard for staging-only Supabase / app mutations.
 * Never log secrets or full connection strings.
 */

export const PRODUCTION_PROJECT_REF = 'dmilmlhquttcozxlpfxw';

/** Approved hosted staging ref; set via STAGING_SUPABASE_PROJECT_REF or STAGING_PROJECT_REF. */
export const STAGING_PROJECT_REF =
  process.env.STAGING_SUPABASE_PROJECT_REF?.trim().toLowerCase() ??
  process.env.STAGING_PROJECT_REF?.trim().toLowerCase() ??
  '';

const PRODUCTION_HOST_PATTERNS = [
  /dmilmlhquttcozxlpfxw/i,
  /hc-violins-and-bows\.vercel\.app/i,
  /hcviolins/i,
];

export type StagingEnvironment = {
  environment: 'staging';
  approvedProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  appBaseUrl: string;
};

export type StagingGuardInput = Partial<{
  approvedProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  appBaseUrl: string;
}>;

function fail(message: string): never {
  throw new Error(`Staging guard blocked: ${message}`);
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

    const pooler = host.match(
      /^aws-0-[a-z0-9-]+\.pooler\.supabase\.com$/i
    );
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

function assertNonProductionRef(projectRef: string | null, label: string): void {
  if (!projectRef) {
    return;
  }

  if (projectRef === PRODUCTION_PROJECT_REF) {
    fail(`${label} targets production project ref ${PRODUCTION_PROJECT_REF}.`);
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

function assertNoProductionHostPatterns(value: string, label: string): void {
  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(value)) {
      fail(`${label} matches production blocklist pattern.`);
    }
  }
}

function assertAppBaseUrlAllowed(appBaseUrl: string, approvedRef: string): void {
  assertNoProductionHostPatterns(appBaseUrl, 'Application base URL');

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
  input: StagingGuardInput
): StagingEnvironment {
  const approvedProjectRef = input.approvedProjectRef?.trim().toLowerCase();
  const supabaseUrl = input.supabaseUrl?.trim();
  const supabaseAnonKey = input.supabaseAnonKey?.trim();
  const serviceRoleKey = input.serviceRoleKey?.trim();
  const databaseUrl = input.databaseUrl?.trim();
  const appBaseUrl = input.appBaseUrl?.trim();

  if (
    !approvedProjectRef ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    !serviceRoleKey ||
    !databaseUrl ||
    !appBaseUrl
  ) {
    fail(
      'Required staging identity is incomplete. Set approved project ref, Supabase URL, anon key, service role key, DATABASE_URL, and app base URL.'
    );
  }

  if (approvedProjectRef === PRODUCTION_PROJECT_REF) {
    fail('Approved staging project ref cannot equal production.');
  }

  assertNoProductionHostPatterns(supabaseUrl, 'Supabase URL');
  assertNoProductionHostPatterns(databaseUrl, 'DATABASE_URL');
  assertNoProductionHostPatterns(appBaseUrl, 'Application base URL');

  const urlRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
  const dbRef = extractProjectRefFromDatabaseUrl(databaseUrl);

  assertNonProductionRef(urlRef, 'Supabase URL');
  assertNonProductionRef(dbRef, 'DATABASE_URL');

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

  const serviceRoleRef = decodeJwtRef(serviceRoleKey);
  if (serviceRoleRef) {
    assertNonProductionRef(serviceRoleRef, 'Service role key');
    assertApprovedRef(serviceRoleRef, approvedProjectRef, 'Service role key');
  }

  assertAppBaseUrlAllowed(appBaseUrl, approvedProjectRef);

  return {
    environment: 'staging',
    approvedProjectRef,
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    databaseUrl,
    appBaseUrl,
  };
}

export function loadStagingEnvironmentFromProcessEnv(): StagingEnvironment {
  return assertStagingEnvironment({
    approvedProjectRef:
      process.env.STAGING_SUPABASE_PROJECT_REF ??
      process.env.STAGING_PROJECT_REF,
    supabaseUrl:
      process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey:
      process.env.STAGING_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey:
      process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: process.env.STAGING_DATABASE_URL ?? process.env.DATABASE_URL,
    appBaseUrl:
      process.env.STAGING_APP_BASE_URL ?? process.env.AUTH_MATRIX_BASE_URL,
  });
}
