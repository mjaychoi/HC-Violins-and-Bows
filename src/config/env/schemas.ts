import { z } from 'zod';

export type EnvMap = Record<string, string | undefined>;

export function readTrimmed(env: EnvMap, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

function addCustomIssue(ctx: z.RefinementCtx, message: string): void {
  ctx.addIssue({
    code: 'custom',
    message,
  });
}

export function requiredNonEmptyString(key: string) {
  return z
    .string({ error: `${key} is missing.` })
    .trim()
    .min(1, `${key} is missing or empty.`);
}

export function requiredHttpsUrl(
  key: string,
  options?: { allowLocal?: boolean }
) {
  return requiredNonEmptyString(key).superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      addCustomIssue(ctx, `${key} is not a valid URL.`);
      return;
    }

    if (parsed.protocol !== 'https:') {
      addCustomIssue(ctx, `${key} must use https.`);
      return;
    }

    if (!options?.allowLocal && isLocalHostname(parsed.hostname)) {
      addCustomIssue(
        ctx,
        `${key} must not point to a localhost or local-only host.`
      );
    }
  });
}

export function optionalHttpsUrl(key: string) {
  return z
    .string()
    .trim()
    .min(1)
    .optional()
    .superRefine((value, ctx) => {
      if (value == null) return;
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        addCustomIssue(ctx, `${key} is not a valid URL.`);
        return;
      }
      if (parsed.protocol !== 'https:') {
        addCustomIssue(ctx, `${key} must use https.`);
      }
    });
}

export function optionalPostgresUrl(key: string) {
  return z
    .string()
    .trim()
    .min(1)
    .optional()
    .superRefine((value, ctx) => {
      if (value == null) return;
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        addCustomIssue(ctx, `${key} is not a valid URL.`);
        return;
      }
      if (
        parsed.protocol !== 'postgres:' &&
        parsed.protocol !== 'postgresql:'
      ) {
        addCustomIssue(
          ctx,
          `${key} must use the postgres:// or postgresql:// scheme.`
        );
      }
      if (isLocalHostname(parsed.hostname)) {
        addCustomIssue(
          ctx,
          `${key} must not point to a localhost or local-only host in production.`
        );
      }
    });
}

/**
 * Client-safe production schema. Only NEXT_PUBLIC_* keys.
 * Importable from browser code; contains no server secret fields.
 */
export const publicProductionSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredHttpsUrl('NEXT_PUBLIC_SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredNonEmptyString(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ),
  NEXT_PUBLIC_APP_URL: requiredHttpsUrl('NEXT_PUBLIC_APP_URL'),
  NEXT_PUBLIC_SENTRY_DSN: optionalHttpsUrl('NEXT_PUBLIC_SENTRY_DSN'),
});

/**
 * Server-only production schema. Must not be imported into Client Components
 * together with a module-level parse of process.env.
 */
export const serverProductionSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: requiredNonEmptyString(
    'SUPABASE_SERVICE_ROLE_KEY'
  ),
  STORAGE_TYPE: z
    .string({ error: 'STORAGE_TYPE is missing.' })
    .trim()
    .min(1, 'STORAGE_TYPE is missing or empty.')
    .superRefine((value, ctx) => {
      if (value.toLowerCase() !== 's3') {
        addCustomIssue(
          ctx,
          'STORAGE_TYPE must be "s3" in production (local filesystem storage is development/test only).'
        );
      }
    }),
  S3_BUCKET_NAME: requiredNonEmptyString('S3_BUCKET_NAME'),
  S3_REGION: requiredNonEmptyString('S3_REGION'),
  AWS_ACCESS_KEY_ID: requiredNonEmptyString('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: requiredNonEmptyString('AWS_SECRET_ACCESS_KEY'),
  UPSTASH_REDIS_REST_URL: requiredHttpsUrl('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: requiredNonEmptyString('UPSTASH_REDIS_REST_TOKEN'),
  ORPHAN_CLEANUP_SECRET: requiredNonEmptyString('ORPHAN_CLEANUP_SECRET'),
  SUPABASE_URL: optionalHttpsUrl('SUPABASE_URL'),
  SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
  AWS_ENDPOINT_URL: optionalHttpsUrl('AWS_ENDPOINT_URL'),
  S3_ADDRESSING_STYLE: z.string().trim().min(1).optional(),
  KMS_KEY_ID: z.string().trim().min(1).optional(),
  HEALTH_CHECK_SECRET: z.string().trim().min(1).optional(),
  DATABASE_URL: optionalPostgresUrl('DATABASE_URL'),
  SENTRY_DSN: optionalHttpsUrl('SENTRY_DSN'),
  SENTRY_ORG: z.string().trim().min(1).optional(),
  SENTRY_PROJECT: z.string().trim().min(1).optional(),
  SENTRY_AUTH_TOKEN: z.string().trim().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().trim().min(1).optional(),
  SENTRY_MIN_LEVEL: z.string().trim().min(1).optional(),
  RATE_LIMITING_DISABLED: z.string().trim().min(1).optional(),
  ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

export const productionEnvSchema = publicProductionSchema.merge(
  serverProductionSchema
);

export type PublicProductionEnv = z.infer<typeof publicProductionSchema>;
export type ServerProductionEnv = z.infer<typeof serverProductionSchema>;
export type ProductionEnv = z.infer<typeof productionEnvSchema>;
