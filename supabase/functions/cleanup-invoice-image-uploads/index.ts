// Supabase Edge Function: clean up expired, unclaimed invoice image uploads

// @ts-expect-error - Deno URL import, works at runtime but TypeScript doesn't understand it
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildNoExpiredUploadsResponse,
  cleanupExpiredInvoiceImageUploads,
  type UploadRow,
} from './core.ts';
import { getOrCreateInvocationId } from '../_shared/invocation.ts';

const logWarn = (...args: unknown[]) => console.warn('[WARN]', ...args);
const logError = (...args: unknown[]) => console.error('[ERROR]', ...args);

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLEANUP_SECRET = Deno.env.get('CLEANUP_INVOICE_IMAGE_UPLOADS_SECRET')!;
const INVOICE_BUCKET = 'invoices';
const DEFAULT_BATCH_SIZE = 100;

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hasValidInvocationSecret(req: Request): boolean {
  const providedSecret = req.headers
    .get('x-cleanup-invoice-image-uploads-secret')
    ?.trim();
  return Boolean(
    CLEANUP_SECRET && providedSecret && providedSecret === CLEANUP_SECRET
  );
}

serve(async req => {
  const invocationId = getOrCreateInvocationId(req);
  try {
    if (!CLEANUP_SECRET) {
      logError(
        `[${invocationId}] CLEANUP_INVOICE_IMAGE_UPLOADS_SECRET is not configured`
      );
      return jsonResponse(
        { error: 'Function misconfigured', invocation_id: invocationId },
        500
      );
    }

    if (req.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed', invocation_id: invocationId },
        405
      );
    }

    if (!hasValidInvocationSecret(req)) {
      return jsonResponse(
        { error: 'Unauthorized', invocation_id: invocationId },
        401
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const nowIso = new Date().toISOString();

    let batchSize = DEFAULT_BATCH_SIZE;
    try {
      const body = await req.json().catch(() => null);
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { batchSize?: unknown }).batchSize === 'number'
      ) {
        batchSize = Math.max(
          1,
          Math.min(
            DEFAULT_BATCH_SIZE,
            (body as { batchSize: number }).batchSize
          )
        );
      }
    } catch {
      // ignore malformed body and fall back to default batch size
    }

    const { data, error } = await supabase
      .from('invoice_image_uploads')
      .select('org_id, file_path, expires_at')
      .is('linked_invoice_id', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', nowIso)
      .limit(batchSize);

    if (error) {
      logError(
        `[${invocationId}] Failed to fetch expired invoice image uploads`,
        error
      );
      return jsonResponse(
        {
          error: 'Failed to fetch expired invoice image uploads',
          invocation_id: invocationId,
        },
        500
      );
    }

    const expiredUploads = (data ?? []) as UploadRow[];
    if (expiredUploads.length === 0) {
      const response = buildNoExpiredUploadsResponse(nowIso, invocationId);
      return jsonResponse(response.payload, response.status);
    }

    const response = await cleanupExpiredInvoiceImageUploads({
      uploads: expiredUploads,
      invocationId,
      timestamp: nowIso,
      removeFile: async upload => {
        const { error: storageError } = await supabase.storage
          .from(INVOICE_BUCKET)
          .remove([upload.file_path]);

        return { error: storageError };
      },
      deleteTrackingRow: async upload => {
        const { error: deleteError } = await supabase
          .from('invoice_image_uploads')
          .delete()
          .eq('org_id', upload.org_id)
          .eq('file_path', upload.file_path);

        return { error: deleteError };
      },
      onWarn: message => logWarn(message),
    });

    return jsonResponse(response.payload, response.status);
  } catch (error) {
    logError(
      `[${invocationId}] Error in cleanup-invoice-image-uploads function:`,
      error
    );
    return jsonResponse(
      {
        error: 'Internal server error',
        invocation_id: invocationId,
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
