#!/usr/bin/env tsx
/**
 * Production environment validation CLI.
 *
 * Usage: npm run check:env
 *
 * Validates the current process environment as a production deployment
 * configuration. Exits 0 on success, non-zero on failure.
 * Never prints secret values.
 */

import * as dotenv from 'dotenv';
import {
  formatProductionEnvResult,
  type EnvMap,
} from '../src/config/env/issues';
import { validateProductionEnv } from '../src/config/env/production';

export function runProductionEnvCheck(env: EnvMap = process.env): {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = validateProductionEnv(env);
  const formatted = formatProductionEnvResult(result, env);
  return {
    ok: result.ok,
    exitCode: result.ok ? 0 : 1,
    stdout: formatted.stdout,
    stderr: formatted.stderr,
  };
}

function isDirectRun(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, '/');
  return Boolean(entry?.endsWith('scripts/check-env.ts'));
}

if (isDirectRun()) {
  dotenv.config({ path: '.env.local' });
  const outcome = runProductionEnvCheck(process.env);
  if (outcome.stdout) {
    console.log(outcome.stdout);
  }
  if (outcome.stderr) {
    console.error(outcome.stderr);
  }
  process.exit(outcome.exitCode);
}
