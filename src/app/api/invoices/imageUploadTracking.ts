import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, logWarn } from '@/utils/logger';
import { extractInvoiceImageStoragePaths } from './imageUrls';

type InvoiceItemsLike =
  | Array<{
      image_url?: string | null;
    }>
  | null
  | undefined;

export type InvoiceImageClaimResult = {
  status: 'not_requested' | 'claimed' | 'partial' | 'failed';
  requestedCount: number;
  claimedCount: number;
  missingCount: number;
  missingPaths: string[];
};

const INVOICE_IMAGE_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_CLAIM_PATHS = 200;
const MAX_FILE_PATH_LENGTH = 1_024;

function isValidStoragePath(filePath: string): boolean {
  const trimmed = filePath.trim();

  if (!trimmed) return false;
  if (trimmed.length > MAX_FILE_PATH_LENGTH) return false;
  if (trimmed.includes('\0')) return false;
  if (trimmed.includes('..')) return false;
  if (trimmed.startsWith('/')) return false;
  if (trimmed.includes('\\')) return false;

  return true;
}

function normalizeStoragePath(filePath: string): string | null {
  const trimmed = filePath.trim();

  if (!isValidStoragePath(trimmed)) {
    return null;
  }

  return trimmed;
}

function getUniqueValidImagePaths(items: InvoiceItemsLike): string[] {
  const rawPaths = extractInvoiceImageStoragePaths(items);

  return Array.from(
    new Set(
      rawPaths
        .map(path => normalizeStoragePath(path))
        .filter((path): path is string => Boolean(path))
    )
  );
}

export async function recordInvoiceImageUpload(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  filePath: string
): Promise<{ error: unknown | null }> {
  const normalizedPath = normalizeStoragePath(filePath);

  if (!normalizedPath) {
    return {
      error: new Error('Invalid invoice image storage path'),
    };
  }

  const { error } = await supabase.from('invoice_image_uploads').upsert(
    {
      org_id: orgId,
      file_path: normalizedPath,
      uploaded_by_user_id: userId,
      linked_invoice_id: null,
      claimed_at: null,
      expires_at: new Date(
        Date.now() + INVOICE_IMAGE_UPLOAD_TTL_MS
      ).toISOString(),
    },
    {
      onConflict: 'org_id,file_path',
    }
  );

  return { error };
}

export async function claimInvoiceImageUploads(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  items: InvoiceItemsLike
): Promise<InvoiceImageClaimResult> {
  const filePaths = getUniqueValidImagePaths(items);

  if (filePaths.length === 0) {
    return {
      status: 'not_requested',
      requestedCount: 0,
      claimedCount: 0,
      missingCount: 0,
      missingPaths: [],
    };
  }

  if (filePaths.length > MAX_IMAGE_CLAIM_PATHS) {
    logWarn(
      'invoice-image.claim-tracking.too-many-paths',
      `invoiceId=${invoiceId} orgId=${orgId} requested=${filePaths.length}`
    );

    return {
      status: 'failed',
      requestedCount: filePaths.length,
      claimedCount: 0,
      missingCount: filePaths.length,
      missingPaths: filePaths,
    };
  }

  const nowIso = new Date().toISOString();

  let claimQuery = supabase
    .from('invoice_image_uploads')
    .update({
      linked_invoice_id: invoiceId,
      claimed_at: nowIso,
      expires_at: null,
    })
    .select('file_path')
    .eq('org_id', orgId);

  if ('is' in claimQuery && typeof claimQuery.is === 'function') {
    claimQuery = claimQuery.is('linked_invoice_id', null);
  }

  if ('gt' in claimQuery && typeof claimQuery.gt === 'function') {
    claimQuery = claimQuery.gt('expires_at', nowIso);
  }

  const { data, error } = await claimQuery.in('file_path', filePaths);

  if (error) {
    logError('Invoice image claim tracking failed:', error);
    logWarn(
      'invoice-image.claim-tracking.failed',
      `invoiceId=${invoiceId} orgId=${orgId} fileCount=${filePaths.length}`
    );

    return {
      status: 'failed',
      requestedCount: filePaths.length,
      claimedCount: 0,
      missingCount: filePaths.length,
      missingPaths: filePaths,
    };
  }

  const claimedPaths = new Set(
    Array.isArray(data)
      ? data
          .map(row =>
            typeof (row as { file_path?: unknown }).file_path === 'string'
              ? ((row as { file_path?: string }).file_path as string)
              : null
          )
          .filter((value): value is string => value !== null)
      : []
  );

  const missingPaths = filePaths.filter(
    filePath => !claimedPaths.has(filePath)
  );

  if (missingPaths.length > 0) {
    logWarn(
      'invoice-image.claim-tracking.partial',
      `invoiceId=${invoiceId} orgId=${orgId} requested=${filePaths.length} claimed=${claimedPaths.size} missing=${missingPaths.length}`,
      { missingPaths }
    );
  }

  return {
    status: missingPaths.length > 0 ? 'partial' : 'claimed',
    requestedCount: filePaths.length,
    claimedCount: claimedPaths.size,
    missingCount: missingPaths.length,
    missingPaths,
  };
}
