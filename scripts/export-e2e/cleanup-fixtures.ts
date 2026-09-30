import { createClient } from '@supabase/supabase-js';

import { executeHostedCleanup } from '../auth-matrix/hosted-cleanup';
import { readRuntimeManifestFile } from '../auth-matrix/runtime-manifest';
import { loadExportE2EEnvironment } from './env-guard';
import { countExportResiduals, residualTotal } from './residuals';

async function main(): Promise<void> {
  const manifestPath = process.env.EXPORT_E2E_RUNTIME_MANIFEST?.trim();
  if (!manifestPath) {
    throw new Error(
      'EXPORT_E2E_RUNTIME_MANIFEST is required for export cleanup.'
    );
  }

  const manifest = await readRuntimeManifestFile(manifestPath);
  if (!manifest) {
    console.log(
      JSON.stringify({
        cleanup: 'no-manifest',
        residualFixtures: 0,
      })
    );
    return;
  }

  const env = loadExportE2EEnvironment();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await executeHostedCleanup(admin, manifest);
  const residuals = await countExportResiduals(admin, manifest);
  const leftover = residualTotal(residuals);
  console.log(
    JSON.stringify({
      cleanup: 'ran',
      runId: manifest.runId,
      residualFixtures: leftover,
      residuals,
    })
  );
  if (leftover !== 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Export cleanup failed.'
  );
  process.exit(1);
});
