/**
 * Guards integration tests against production Supabase / app hosts.
 * Never commit secret values — only env var names are referenced elsewhere.
 */

const PRODUCTION_PROJECT_REFS = new Set(['dmilmlhquttcozxlpfxw']);

const PRODUCTION_HOST_PATTERNS = [
  /hc-violins-and-bows\.vercel\.app/i,
  /hcviolins/i,
  /production/i,
];

export type AuthMatrixEnvironment = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  baseUrl: string;
  projectRef: string | null;
};

function extractProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertNonProductionAuthMatrixEnv(
  env: Partial<AuthMatrixEnvironment>
): AuthMatrixEnvironment {
  const supabaseUrl = env.supabaseUrl?.trim();
  const supabaseAnonKey = env.supabaseAnonKey?.trim();
  const serviceRoleKey = env.serviceRoleKey?.trim();
  const baseUrl = env.baseUrl?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !baseUrl) {
    throw new Error(
      'Auth matrix requires AUTH_MATRIX_SUPABASE_URL, AUTH_MATRIX_SUPABASE_ANON_KEY, AUTH_MATRIX_SERVICE_ROLE_KEY, and AUTH_MATRIX_BASE_URL.'
    );
  }

  const projectRef = extractProjectRef(supabaseUrl);

  if (projectRef && PRODUCTION_PROJECT_REFS.has(projectRef)) {
    throw new Error(
      `Auth matrix aborted: Supabase project ref ${projectRef} matches production blocklist.`
    );
  }

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(supabaseUrl) || pattern.test(baseUrl)) {
      throw new Error(
        'Auth matrix aborted: host matches production blocklist pattern.'
      );
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Auth matrix must not run with NODE_ENV=production.');
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    baseUrl,
    projectRef,
  };
}

export function isAuthMatrixEnabled(): boolean {
  return process.env.AUTH_MATRIX_ENABLED === '1';
}

export function loadAuthMatrixEnvironment(): AuthMatrixEnvironment | null {
  if (!isAuthMatrixEnabled()) {
    return null;
  }

  return assertNonProductionAuthMatrixEnv({
    supabaseUrl: process.env.AUTH_MATRIX_SUPABASE_URL,
    supabaseAnonKey: process.env.AUTH_MATRIX_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.AUTH_MATRIX_SERVICE_ROLE_KEY,
    baseUrl: process.env.AUTH_MATRIX_BASE_URL,
  });
}

export type AuthMatrixJwtFixtures = {
  orgAAdmin: string;
  orgAMember: string;
  orgBAdmin: string;
  orgBMember: string;
};

export function loadAuthMatrixJwtFixtures(): AuthMatrixJwtFixtures | null {
  if (!isAuthMatrixEnabled()) {
    return null;
  }

  const orgAAdmin = process.env.AUTH_MATRIX_JWT_ORG_A_ADMIN?.trim();
  const orgAMember = process.env.AUTH_MATRIX_JWT_ORG_A_MEMBER?.trim();
  const orgBAdmin = process.env.AUTH_MATRIX_JWT_ORG_B_ADMIN?.trim();
  const orgBMember = process.env.AUTH_MATRIX_JWT_ORG_B_MEMBER?.trim();

  if (!orgAAdmin || !orgAMember || !orgBAdmin || !orgBMember) {
    throw new Error(
      'Auth matrix requires AUTH_MATRIX_JWT_ORG_A_ADMIN, AUTH_MATRIX_JWT_ORG_A_MEMBER, AUTH_MATRIX_JWT_ORG_B_ADMIN, AUTH_MATRIX_JWT_ORG_B_MEMBER.'
    );
  }

  return { orgAAdmin, orgAMember, orgBAdmin, orgBMember };
}
