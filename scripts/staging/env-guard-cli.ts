#!/usr/bin/env tsx
/**
 * CLI preflight for staging-only scripts and CI steps.
 * Usage: npx tsx scripts/staging/env-guard-cli.ts
 */

import { loadStagingEnvironmentFromProcessEnv } from './env-guard';

try {
  const env = loadStagingEnvironmentFromProcessEnv();
  console.log(
    JSON.stringify({
      ok: true,
      environment: env.environment,
      approvedProjectRef: env.approvedProjectRef,
      supabaseHost: new URL(env.supabaseUrl).hostname,
      appHost: new URL(env.appBaseUrl).hostname,
    })
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
