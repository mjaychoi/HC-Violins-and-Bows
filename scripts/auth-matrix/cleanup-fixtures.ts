import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  assertUrlIsNotConfiguredProduction,
} from '../staging/env-guard';
import { assertNonProductionAuthMatrixEnv } from '../../tests/integration/auth-matrix/env-guard';
import {
  cleanupLocalAuthMatrixFixtures,
  executeHostedCleanup,
} from './hosted-cleanup';
import { readRuntimeManifestFile } from './runtime-manifest';

dotenv.config({ path: '.env.local' });

async function main() {
  const url =
    process.env.AUTH_MATRIX_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.AUTH_MATRIX_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase URL or service role key for cleanup.');
  }

  assertUrlIsNotConfiguredProduction(url);

  const manifestPath = process.env.AUTH_MATRIX_RUNTIME_MANIFEST?.trim();
  if (manifestPath) {
    assertNonProductionAuthMatrixEnv({
      supabaseUrl: process.env.AUTH_MATRIX_SUPABASE_URL || url,
      supabaseAnonKey: process.env.AUTH_MATRIX_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.AUTH_MATRIX_SERVICE_ROLE_KEY || serviceKey,
      baseUrl: process.env.AUTH_MATRIX_BASE_URL,
      productionProjectRef: process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV],
    });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (manifestPath) {
    const manifest = await readRuntimeManifestFile(manifestPath);
    if (!manifest) {
      console.log('No runtime manifest file; nothing to clean.');
      return;
    }

    await executeHostedCleanup(supabase, manifest);
    console.log(
      `Auth matrix runtime fixtures removed for run ${manifest.runId}.`
    );
    return;
  }

  await cleanupLocalAuthMatrixFixtures(supabase);
  console.log('Auth matrix fixtures removed.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
