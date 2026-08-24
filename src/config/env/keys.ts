/**
 * Authoritative environment-variable catalog.
 *
 * Names here must match the repository's actual process.env keys.
 * Secret values must never be logged; only key names may appear in errors.
 *
 * Do not import this module from Client Components if you later add runtime
 * parsing that includes server secrets. The catalog itself contains names
 * only, not values.
 */

export type EnvVisibility = 'public' | 'server';
export type ProductionRequirement = 'required' | 'optional' | 'emergency';

export type EnvKeySpec = {
  readonly key: string;
  readonly visibility: EnvVisibility;
  readonly production: ProductionRequirement;
  readonly secret: boolean;
};

export const ENV_KEY_CATALOG = [
  // Public / client-safe (NEXT_PUBLIC_*). These may appear in the browser bundle.
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    visibility: 'public',
    production: 'required',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    visibility: 'public',
    production: 'required',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    visibility: 'public',
    production: 'required',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_SENTRY_DSN',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_APP_NAME',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_APP_VERSION',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_LOG_LEVEL',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_STORE_NAME',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_STORE_PHONE',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_STORE_EMAIL',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_STORE_ADDRESS',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_LOGO_URL',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_DEFAULT_SIGNER_NAME',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_BANK_ACCOUNT_HOLDER',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_BANK_NAME',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_BANK_SWIFT',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },
  {
    key: 'NEXT_PUBLIC_BANK_ACCOUNT',
    visibility: 'public',
    production: 'optional',
    secret: false,
  },

  // Server-only. Never prefix with NEXT_PUBLIC_.
  {
    key: 'SUPABASE_URL',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'SUPABASE_ANON_KEY',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    visibility: 'server',
    production: 'required',
    secret: true,
  },
  {
    key: 'STORAGE_TYPE',
    visibility: 'server',
    production: 'required',
    secret: false,
  },
  {
    key: 'S3_BUCKET_NAME',
    visibility: 'server',
    production: 'required',
    secret: false,
  },
  {
    key: 'S3_REGION',
    visibility: 'server',
    production: 'required',
    secret: false,
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    visibility: 'server',
    production: 'required',
    secret: true,
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    visibility: 'server',
    production: 'required',
    secret: true,
  },
  {
    key: 'AWS_ENDPOINT_URL',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'S3_ADDRESSING_STYLE',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'KMS_KEY_ID',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'UPLOAD_MAX_FILE_SIZE_MB',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'STORAGE_BASE_PREFIX',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'STORAGE_LOCAL_ROOT',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'UPSTASH_REDIS_REST_URL',
    visibility: 'server',
    production: 'required',
    secret: false,
  },
  {
    key: 'UPSTASH_REDIS_REST_TOKEN',
    visibility: 'server',
    production: 'required',
    secret: true,
  },
  {
    key: 'ORPHAN_CLEANUP_SECRET',
    visibility: 'server',
    production: 'required',
    secret: true,
  },
  {
    key: 'HEALTH_CHECK_SECRET',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'DATABASE_URL',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'DATABASE_PASSWORD',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'SENTRY_DSN',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'SENTRY_ORG',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'SENTRY_PROJECT',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'SENTRY_AUTH_TOKEN',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'SENTRY_TRACES_SAMPLE_RATE',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'SENTRY_MIN_LEVEL',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'ERROR_WEBHOOK_URL',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'ERROR_WEBHOOK_ENABLED',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'ERROR_SEVERITY_THRESHOLD',
    visibility: 'server',
    production: 'optional',
    secret: false,
  },
  {
    key: 'RESEND_API_KEY',
    visibility: 'server',
    production: 'optional',
    secret: true,
  },
  {
    key: 'RATE_LIMITING_DISABLED',
    visibility: 'server',
    production: 'emergency',
    secret: false,
  },
  {
    key: 'ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED',
    visibility: 'server',
    production: 'emergency',
    secret: false,
  },
] as const satisfies readonly EnvKeySpec[];

export type EnvKey = (typeof ENV_KEY_CATALOG)[number]['key'];

export const SECRET_ENV_KEYS: readonly string[] = ENV_KEY_CATALOG.filter(
  spec => spec.secret
).map(spec => spec.key);

export const PRODUCTION_REQUIRED_KEYS: readonly string[] =
  ENV_KEY_CATALOG.filter(spec => spec.production === 'required').map(
    spec => spec.key
  );

export const PUBLIC_ENV_KEYS: readonly string[] = ENV_KEY_CATALOG.filter(
  spec => spec.visibility === 'public'
).map(spec => spec.key);

export const SERVER_ENV_KEYS: readonly string[] = ENV_KEY_CATALOG.filter(
  spec => spec.visibility === 'server'
).map(spec => spec.key);

export const RATE_LIMITING_DISABLED_KEY = 'RATE_LIMITING_DISABLED';
export const ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED_KEY =
  'ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED';
