#!/usr/bin/env tsx
/**
 * CLI preflight for staging-only scripts and CI steps.
 * Usage:
 *   npx tsx scripts/staging/env-guard-cli.ts
 *   npx tsx scripts/staging/env-guard-cli.ts --hosted-rehearsal
 */

import {
  loadHostedStagingRehearsalEnvironmentFromProcessEnv,
  loadStagingEnvironmentFromProcessEnv,
} from './env-guard';

const hostedRehearsal = process.argv.includes('--hosted-rehearsal');

try {
  if (hostedRehearsal) {
    loadHostedStagingRehearsalEnvironmentFromProcessEnv();
    console.log(
      JSON.stringify({
        ok: true,
        environment: 'staging',
        targetClassification: 'hosted-staging',
        productionTargetRejected: true,
        localFallbackRejected: true,
      })
    );
  } else {
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
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
