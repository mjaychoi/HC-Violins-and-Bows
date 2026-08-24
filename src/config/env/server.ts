/**
 * Server-only environment helpers.
 *
 * This module must not be imported from Client Components. It reads server
 * secret names (never logs values).
 */

import 'server-only';

import type { EnvMap, EnvValidationResult } from './issues';
import { parsePublicDevEnv } from './public';
import { validateProductionEnv } from './production';

/**
 * Lenient development/test server env: production secrets are not required.
 */
export function parseServerDevEnv(env: EnvMap): { ok: true } {
  void env;
  parsePublicDevEnv(env);
  return { ok: true };
}

/**
 * Strict server parse used by the production deployment path.
 */
export function parseServerProductionEnv(env: EnvMap): EnvValidationResult {
  return validateProductionEnv(env);
}
