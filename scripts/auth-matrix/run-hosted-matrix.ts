import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  assertUrlIsNotConfiguredProduction,
} from '../staging/env-guard';
import { assertNonProductionAuthMatrixEnv } from '../../tests/integration/auth-matrix/env-guard';
import { runHostedCookieAuthMatrix } from './hosted-runner';
import { resolveRuntimeManifestPath } from './runtime-manifest';

dotenv.config({ path: '.env.local' });

function loadHostedMatrixEnv() {
  return assertNonProductionAuthMatrixEnv({
    supabaseUrl: process.env.AUTH_MATRIX_SUPABASE_URL,
    supabaseAnonKey: process.env.AUTH_MATRIX_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.AUTH_MATRIX_SERVICE_ROLE_KEY,
    baseUrl: process.env.AUTH_MATRIX_BASE_URL,
    productionProjectRef: process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV],
  });
}

async function main() {
  const env = loadHostedMatrixEnv();
  assertUrlIsNotConfiguredProduction(env.supabaseUrl);

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const manifestPath = resolveRuntimeManifestPath();
  const result = await runHostedCookieAuthMatrix({
    env,
    admin,
    manifestPath,
  });

  console.log(
    JSON.stringify({
      runId: result.runId,
      passed: result.passed,
      failed: result.failed,
      cookieBacked: true,
      cleanupRan: result.cleanupRan,
    })
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
