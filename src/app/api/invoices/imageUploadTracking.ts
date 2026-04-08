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

export async function recordInvoiceImageUpload(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  filePath: string
): Promise<{ error: unknown | null }> {
  const { error } = await supabase.from('invoice_image_uploads').upsert(
    {
      org_id: orgId,
      file_path: filePath,
      uploaded_by_user_id: userId,
      linked_invoice_id: null,
      claimed_at: null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
  const filePaths = Array.from(new Set(extractInvoiceImageStoragePaths(items)));
  if (filePaths.length === 0) {
    return {
      status: 'not_requested',
      requestedCount: 0,
      claimedCount: 0,
      missingCount: 0,
      missingPaths: [],
    };
  }

  const { data, error } = await supabase
    .from('invoice_image_uploads')
    .update({
      linked_invoice_id: invoiceId,
      claimed_at: new Date().toISOString(),
      expires_at: null,
    })
    .select('file_path')
    .eq('org_id', orgId)
    .in('file_path', filePaths);

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
