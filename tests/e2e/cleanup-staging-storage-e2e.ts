/**
 * CI safety net for staging storage E2E: deletes exactly this run's objects
 * under `e2e/<scopeKey>/` in the validated staging bucket, then verifies none
 * remain. Idempotent. The bucket lifecycle rule on `e2e/` is the backstop
 * for a run that never reaches this step (docs/ops/staging-storage-e2e.md).
 *
 * Re-validates the full staging-only contract first and refuses when the env
 * the app ran with does not match it. No-op (exit 0) when storage E2E is
 * disabled. Never logs bucket names, keys, or credentials.
 */
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  assertEffectiveStorageEnv,
  cleanupRunScopedStorage,
  createS3ScopedObjectStore,
  resolveStagingStorageE2E,
} from './staging-storage';

async function main(): Promise<void> {
  const resolution = resolveStagingStorageE2E(process.env);
  if (resolution.mode === 'disabled') {
    console.log(
      JSON.stringify({
        storageCleanup: 'skipped',
        reason: `staging storage E2E ${resolution.reason}`,
      })
    );
    return;
  }
  assertEffectiveStorageEnv(process.env, resolution);

  const client = new S3Client({
    region: resolution.region,
    credentials: {
      accessKeyId: resolution.accessKeyId,
      secretAccessKey: resolution.secretAccessKey,
    },
  });
  try {
    const result = await cleanupRunScopedStorage(
      createS3ScopedObjectStore(client, {
        ListObjectsV2Command,
        DeleteObjectsCommand,
      }),
      { bucket: resolution.bucket, scopeKey: resolution.scopeKey }
    );
    console.log(
      JSON.stringify({
        storageCleanup: 'ran',
        objectPrefix: result.objectPrefix,
        deleted: result.deleted,
        residualTotal: result.residualTotal,
      })
    );
  } finally {
    client.destroy();
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Staging storage cleanup failed.'
  );
  process.exit(1);
});
