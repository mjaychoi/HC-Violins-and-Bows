/**
 * Authoritative production environment validation.
 *
 * Used by `npm run check:env` and `npm run deploy:build`.
 * Pass an explicit env map in tests — never rely on the host process env.
 *
 * Do not import this module from Client Components.
 */

import {
  ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED_KEY,
  RATE_LIMITING_DISABLED_KEY,
} from './keys';
import type { EnvIssue, EnvMap, EnvValidationResult } from './issues';
import {
  productionEnvSchema,
  readTrimmed,
  type EnvMap as SchemaEnvMap,
} from './schemas';

function pickProductionInput(env: EnvMap): SchemaEnvMap {
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SENTRY_DSN',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STORAGE_TYPE',
    'S3_BUCKET_NAME',
    'S3_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ORPHAN_CLEANUP_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'AWS_ENDPOINT_URL',
    'S3_ADDRESSING_STYLE',
    'KMS_KEY_ID',
    'HEALTH_CHECK_SECRET',
    'DATABASE_URL',
    'SENTRY_DSN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_TRACES_SAMPLE_RATE',
    'SENTRY_MIN_LEVEL',
    RATE_LIMITING_DISABLED_KEY,
    ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED_KEY,
  ] as const;

  const picked: SchemaEnvMap = {};
  for (const key of keys) {
    picked[key] = readTrimmed(env, key);
  }
  return picked;
}

function zodIssuesToEnvIssues(
  issues: readonly { path: PropertyKey[]; message: string }[]
): EnvIssue[] {
  const seen = new Set<string>();
  const mapped: EnvIssue[] = [];

  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'environment');
    const fingerprint = `${key}:${issue.message}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    mapped.push({ key, message: issue.message });
  }

  return mapped;
}

function addIssue(issues: EnvIssue[], key: string, message: string): void {
  if (issues.some(issue => issue.key === key && issue.message === message)) {
    return;
  }
  issues.push({ key, message });
}

function assertPairedValuesMatch(
  issues: EnvIssue[],
  leftKey: string,
  rightKey: string,
  left: string | undefined,
  right: string | undefined
): void {
  if (!left || !right) return;
  if (left !== right) {
    addIssue(
      issues,
      rightKey,
      `${leftKey} and ${rightKey} are both set but do not match.`
    );
  }
}

function validateRateLimitingOverride(
  env: EnvMap,
  issues: EnvIssue[],
  warnings: string[]
): void {
  const disabled = readTrimmed(env, RATE_LIMITING_DISABLED_KEY) === 'true';
  const acknowledged =
    readTrimmed(env, ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED_KEY) ===
    'true';

  if (!disabled) {
    return;
  }

  if (!acknowledged) {
    addIssue(
      issues,
      RATE_LIMITING_DISABLED_KEY,
      'RATE_LIMITING_DISABLED=true is not allowed for an ordinary production deployment. Rate limiting must stay enabled. If this is an emergency fail-open, also set ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED=true. Do not use this flag as a substitute for UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.'
    );
    return;
  }

  warnings.push(
    'RATE_LIMITING_DISABLED=true with ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED=true — production rate limiting is explicitly disabled. This is an emergency fail-open, not a substitute for Upstash configuration.'
  );
}

/**
 * Validate a production deployment environment.
 * Never includes secret values in issues or warnings.
 */
export function validateProductionEnv(env: EnvMap): EnvValidationResult {
  const input = pickProductionInput(env);
  const parsed = productionEnvSchema.safeParse(input);
  const issues: EnvIssue[] = parsed.success
    ? []
    : zodIssuesToEnvIssues(parsed.error.issues);
  const warnings: string[] = [];

  assertPairedValuesMatch(
    issues,
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    readTrimmed(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    readTrimmed(env, 'SUPABASE_URL')
  );
  assertPairedValuesMatch(
    issues,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    readTrimmed(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    readTrimmed(env, 'SUPABASE_ANON_KEY')
  );

  const addressing = readTrimmed(env, 'S3_ADDRESSING_STYLE');
  if (
    addressing &&
    addressing !== 'virtual-hosted-style' &&
    addressing !== 'path-style'
  ) {
    addIssue(
      issues,
      'S3_ADDRESSING_STYLE',
      'S3_ADDRESSING_STYLE must be "virtual-hosted-style" or "path-style".'
    );
  }

  validateRateLimitingOverride(env, issues, warnings);

  if (issues.length > 0) {
    return { ok: false, issues, warnings };
  }

  return { ok: true, warnings };
}

/**
 * Development and test workflows must not require live production credentials.
 */
export function validateNonProductionEnv(_env: EnvMap): EnvValidationResult {
  return { ok: true, warnings: [] };
}
