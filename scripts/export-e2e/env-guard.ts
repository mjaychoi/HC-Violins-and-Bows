import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  valueContainsProjectRef,
} from '../staging/env-guard';
import {
  APPROVED_STAGING_APP_HOSTNAME,
  APPROVED_STAGING_PROJECT_REF,
} from './constants';

const PROJECT_REF_FORMAT = /^[a-z0-9]{10,32}$/;

const PRODUCTION_HOST_PATTERNS = [
  /hc-violins-and-bows\.vercel\.app/i,
  /hcviolins/i,
  /production/i,
];

export type ExportE2EEnvironment = {
  stagingProjectRef: string;
  productionProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  appBaseUrl: string;
  databaseUrl: string | null;
};

export type ExportE2EGuardInput = Partial<{
  stagingProjectRef: string;
  productionProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  appBaseUrl: string;
  databaseUrl: string;
  nodeEnv: string;
}>;

function fail(message: string): never {
  throw new Error(`Export E2E guard blocked: ${message}`);
}

export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function assertExportE2EEnvironment(
  input: ExportE2EGuardInput
): ExportE2EEnvironment {
  const stagingProjectRef = input.stagingProjectRef?.trim().toLowerCase() ?? '';
  const productionProjectRef =
    input.productionProjectRef?.trim().toLowerCase() ?? '';
  const supabaseUrl = input.supabaseUrl?.trim() ?? '';
  const supabaseAnonKey = input.supabaseAnonKey?.trim() ?? '';
  const serviceRoleKey = input.serviceRoleKey?.trim() ?? '';
  const appBaseUrl = input.appBaseUrl?.trim().replace(/\/$/, '') ?? '';
  const databaseUrl = input.databaseUrl?.trim() || null;
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;

  if (
    !stagingProjectRef ||
    !productionProjectRef ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    !serviceRoleKey ||
    !appBaseUrl
  ) {
    fail(
      'STAGING_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_PROJECT_REF, STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY, and STAGING_APP_BASE_URL are required.'
    );
  }

  if (!PROJECT_REF_FORMAT.test(stagingProjectRef)) {
    fail('STAGING_SUPABASE_PROJECT_REF is not a project ref.');
  }
  if (!PROJECT_REF_FORMAT.test(productionProjectRef)) {
    fail(`${PRODUCTION_SUPABASE_PROJECT_REF_ENV} is not a project ref.`);
  }
  if (stagingProjectRef !== APPROVED_STAGING_PROJECT_REF) {
    fail(
      'STAGING_SUPABASE_PROJECT_REF is not the approved hosted staging project.'
    );
  }
  if (stagingProjectRef === productionProjectRef) {
    fail('staging project ref matches the configured production ref.');
  }

  const supabaseRef = extractSupabaseProjectRef(supabaseUrl);
  if (supabaseRef !== stagingProjectRef) {
    fail('Supabase URL host does not match STAGING_SUPABASE_PROJECT_REF.');
  }
  if (valueContainsProjectRef(supabaseUrl, productionProjectRef)) {
    fail('Supabase URL contains the configured production project ref.');
  }

  let appUrl: URL;
  try {
    appUrl = new URL(appBaseUrl);
  } catch {
    fail('STAGING_APP_BASE_URL is not a URL.');
  }
  if (appUrl.protocol !== 'https:') {
    fail('STAGING_APP_BASE_URL must be https.');
  }
  if (appUrl.hostname.toLowerCase() !== APPROVED_STAGING_APP_HOSTNAME) {
    fail(
      'STAGING_APP_BASE_URL host is not the approved hosted staging application.'
    );
  }
  if (valueContainsProjectRef(appBaseUrl, productionProjectRef)) {
    fail('App URL contains the configured production project ref.');
  }

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(supabaseUrl) || pattern.test(appBaseUrl)) {
      fail('a writable target matches a production host pattern.');
    }
  }

  if (databaseUrl) {
    if (valueContainsProjectRef(databaseUrl, productionProjectRef)) {
      fail(
        'STAGING_DATABASE_URL contains the configured production project ref.'
      );
    }
    if (valueContainsProjectRef(databaseUrl, stagingProjectRef) === false) {
      const databaseRef = extractSupabaseProjectRef(databaseUrl);
      const host = (() => {
        try {
          return new URL(databaseUrl).hostname.toLowerCase();
        } catch {
          return databaseUrl.toLowerCase();
        }
      })();
      if (
        databaseRef === productionProjectRef ||
        host.includes(productionProjectRef)
      ) {
        fail('STAGING_DATABASE_URL targets production.');
      }
    }
  }

  if (nodeEnv === 'production') {
    fail('NODE_ENV=production is not a staging export target.');
  }

  return {
    stagingProjectRef,
    productionProjectRef,
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    appBaseUrl,
    databaseUrl,
  };
}

export function loadExportE2EEnvironment(
  env: Record<string, string | undefined> = process.env
): ExportE2EEnvironment {
  return assertExportE2EEnvironment({
    stagingProjectRef: env.STAGING_SUPABASE_PROJECT_REF,
    productionProjectRef: env[PRODUCTION_SUPABASE_PROJECT_REF_ENV],
    supabaseUrl: env.STAGING_SUPABASE_URL,
    supabaseAnonKey: env.STAGING_SUPABASE_ANON_KEY,
    serviceRoleKey: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    appBaseUrl: env.STAGING_APP_BASE_URL,
    databaseUrl: env.STAGING_DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
}
