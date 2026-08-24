/**
 * Client-safe environment schema.
 *
 * Only NEXT_PUBLIC_* fields belong here. Do not add server secrets.
 */

import { publicProductionSchema, readTrimmed, type EnvMap } from './schemas';
import type { EnvIssue } from './issues';

function pickPublic(env: EnvMap) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: readTrimmed(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: readTrimmed(
      env,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    ),
    NEXT_PUBLIC_APP_URL: readTrimmed(env, 'NEXT_PUBLIC_APP_URL'),
    NEXT_PUBLIC_SENTRY_DSN: readTrimmed(env, 'NEXT_PUBLIC_SENTRY_DSN'),
  };
}

/**
 * Parse public env for production. Missing required public keys fail.
 * Server secrets are never read.
 */
export function parsePublicProductionEnv(env: EnvMap): {
  ok: boolean;
  issues: EnvIssue[];
} {
  const result = publicProductionSchema.safeParse(pickPublic(env));
  if (result.success) {
    return { ok: true, issues: [] };
  }

  return {
    ok: false,
    issues: result.error.issues.map(issue => ({
      key: String(issue.path[0] ?? 'public'),
      message: issue.message,
    })),
  };
}

/**
 * Development/test: public configuration is optional. Presence of production
 * credentials is not required.
 */
export function parsePublicDevEnv(env: EnvMap): { ok: true } {
  void env;
  return { ok: true };
}
