// POST /api/admin/orphan-cleanup
//
// Retries deletion of storage objects that were orphaned during instrument /
// invoice delete operations.  Called by the pg_cron HTTP job defined in
// migration 20260608000002_orphan_cleanup_cron.sql, or by any cron service.
//
// Auth: Authorization: Bearer <ORPHAN_CLEANUP_SECRET>
//   Set ORPHAN_CLEANUP_SECRET in your environment.  The cron migration reads
//   the same value from vault.secrets.
//
// Response body: OrphanCleanupResult JSON

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getStorage } from '@/utils/storage';
import { logInfo, logError } from '@/utils/logger';

const BATCH_SIZE = 100;

type OrphanRow = {
  id: string;
  org_id: string;
  storage_key: string;
  bucket: string;
  source: string;
  error_message: string | null;
};

type OrphanCleanupResult = {
  processed: number;
  cleaned: number;
  stillFailing: number;
  errors: Array<{ id: string; storage_key: string; error: string }>;
};

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ORPHAN_CLEANUP_SECRET;
  if (!secret) {
    // Misconfigured — refuse all requests rather than running unprotected.
    return false;
  }
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token === secret;
}

async function deleteStorageObject(
  row: OrphanRow
): Promise<{ ok: boolean; error?: string }> {
  if (row.bucket === 's3') {
    try {
      await getStorage().deleteFile(row.storage_key);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Supabase Storage bucket
  const admin = getAdminSupabase();
  const { error } = await admin.storage
    .from(row.bucket)
    .remove([row.storage_key]);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminSupabase();
  const result: OrphanCleanupResult = {
    processed: 0,
    cleaned: 0,
    stillFailing: 0,
    errors: [],
  };

  // Process in batches; oldest orphans first.
  const { data: rows, error: fetchError } = await admin
    .from('orphaned_storage_objects')
    .select('id, org_id, storage_key, bucket, source, error_message')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    logError('orphan_cleanup_fetch_failed', fetchError, 'OrphanCleanup');
    return NextResponse.json(
      { error: 'Failed to fetch orphan records', detail: fetchError.message },
      { status: 500 }
    );
  }

  const orphans = (rows ?? []) as OrphanRow[];
  result.processed = orphans.length;

  for (const row of orphans) {
    const { ok, error } = await deleteStorageObject(row);

    if (ok) {
      // Remove the resolved orphan record.  Ignore delete errors — it will
      // be retried on the next run and the worst case is a double-delete
      // attempt (idempotent for both S3 and Supabase Storage).
      await admin.from('orphaned_storage_objects').delete().eq('id', row.id);
      result.cleaned += 1;
    } else {
      // Update error_message so operators can see the latest failure reason.
      await admin
        .from('orphaned_storage_objects')
        .update({ error_message: error ?? 'unknown error' })
        .eq('id', row.id);
      result.stillFailing += 1;
      result.errors.push({
        id: row.id,
        storage_key: row.storage_key,
        error: error ?? 'unknown',
      });
      logError(
        'orphan_cleanup_retry_failed',
        new Error(error),
        'OrphanCleanup',
        {
          orphanId: row.id,
          storageKey: row.storage_key,
          bucket: row.bucket,
          source: row.source,
        }
      );
    }
  }

  logInfo('orphan_cleanup_complete', 'OrphanCleanup', {
    processed: result.processed,
    cleaned: result.cleaned,
    stillFailing: result.stillFailing,
  });

  return NextResponse.json(result, { status: 200 });
}
