import { NextRequest, NextResponse } from 'next/server';
import { validateUUID } from '@/utils/inputValidation';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { getStorage } from '@/utils/storage';
import { errorHandler } from '@/utils/errorHandler';
import { logError } from '@/utils/logger';
import { createApiResponse } from '@/app/api/_utils/apiErrors';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { assertInstrumentsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import {
  applyScopedRateLimit,
  destructiveMutationRateLimit,
  uploadRateLimit,
} from '@/app/api/_utils/rateLimit';
import {
  CERTIFICATE_PDF_TOO_LARGE_ERROR,
  MAX_CERTIFICATE_PDF_SIZE_BYTES,
} from '@/constants/certificateUpload';

const SIGNED_URL_TTL_SECONDS = 600;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');
const MIN_PDF_HEADER_LENGTH = PDF_MAGIC_BYTES.length;

type ValidatedCertificateUpload = {
  file: File;
  buffer: Buffer;
};

type CertificateUploadValidationResult =
  | { ok: true; upload: ValidatedCertificateUpload }
  | { ok: false; response: NextResponse };

function routeJson(payload: unknown, status = 200): NextResponse {
  return createApiResponse(payload, status);
}

async function responseToApiHandlerResult(response: Response) {
  const payload = await response
    .json()
    .catch(() => ({ error: 'Invalid route response payload' }));

  return {
    payload,
    status: response.status,
  };
}

function ensureRequestWithNextUrl(request: NextRequest): NextRequest {
  if ((request as NextRequest & { nextUrl?: URL }).nextUrl) {
    return request;
  }

  return Object.assign(request, {
    nextUrl: new URL(request.url),
  });
}

function sanitizeCertificateFilename(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 180);

  return sanitized || 'certificate.pdf';
}

function isPdfUpload(file: File): boolean {
  const normalizedType = (file.type || '').toLowerCase();
  const isPdfType =
    normalizedType === 'application/pdf' ||
    normalizedType === 'application/x-pdf';
  const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');

  return isPdfType || hasPdfExtension;
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < MIN_PDF_HEADER_LENGTH) {
    return false;
  }

  return buffer.subarray(0, MIN_PDF_HEADER_LENGTH).equals(PDF_MAGIC_BYTES);
}

function getCertificateStorageKey(
  orgId: string,
  instrumentId: string,
  filename: string,
  timestamp = Date.now()
): string {
  return `${orgId}/${instrumentId}/${timestamp}_${sanitizeCertificateFilename(
    filename
  )}`;
}

function getStorageFilename(fileKey: string): string {
  const pathParts = fileKey.split('/');
  return pathParts[pathParts.length - 1] || fileKey;
}

type ScopedCertificateRow = {
  id: string;
  storage_path: string;
  original_name: string | null;
  mime_type: string | null;
  size: number | null;
  created_at: string | null;
  version: number | null;
  is_primary: boolean | null;
  instruments?: { org_id: string }[] | { org_id: string } | null;
};

async function ensureOwnedInstrument(
  auth: AuthContext,
  instrumentId: string
): Promise<
  | { instrument: { id: string; serial_number?: string | null } }
  | { response: NextResponse }
> {
  const orgContextError = requireOrgContext(auth);
  if (orgContextError) {
    return { response: orgContextError };
  }

  const { data: instrument, error } = await auth.userSupabase
    .from('instruments')
    .select('id, serial_number')
    .eq('id', instrumentId)
    .eq('org_id', auth.orgId!)
    .single();

  if (error || !instrument) {
    return {
      response: routeJson({ error: 'Instrument not found' }, 404),
    };
  }

  return { instrument };
}

async function ensureAdminOwnedInstrument(
  auth: AuthContext,
  instrumentId: string
): Promise<
  | { instrument: { id: string; serial_number?: string | null } }
  | { response: NextResponse }
> {
  const orgContextError = requireOrgContext(auth);
  if (orgContextError) {
    return { response: orgContextError };
  }

  const adminError = requireAdmin(auth);
  if (adminError) {
    return { response: adminError };
  }

  return ensureOwnedInstrument(auth, instrumentId);
}

function scopedCertificateQuery(auth: AuthContext, instrumentId: string) {
  return auth.userSupabase
    .from('instrument_certificates')
    .select(
      'id, storage_path, original_name, mime_type, size, created_at, version, is_primary, instruments!inner(org_id)'
    )
    .eq('instrument_id', instrumentId)
    .eq('instruments.org_id', auth.orgId!);
}

async function rollbackUploadedCertificate(
  fileKey: string,
  context: string
): Promise<void> {
  const storage = getStorage();

  try {
    await storage.deleteFile(fileKey);
  } catch (deleteError) {
    logError(context, deleteError);
  }
}

async function validateCertificateUploadFromRequest(
  request: NextRequest
): Promise<CertificateUploadValidationResult> {
  const formData = await request.formData();
  const file = formData.get('certificate') as File | null;

  if (!file) {
    return {
      ok: false,
      response: routeJson({ error: 'No certificate file provided' }, 400),
    };
  }

  if (!isPdfUpload(file)) {
    return {
      ok: false,
      response: routeJson({ error: 'Certificate must be a PDF file' }, 400),
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      response: routeJson({ error: 'Certificate file is empty' }, 400),
    };
  }

  if (file.size > MAX_CERTIFICATE_PDF_SIZE_BYTES) {
    return {
      ok: false,
      response: routeJson({ error: CERTIFICATE_PDF_TOO_LARGE_ERROR }, 400),
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!hasPdfMagicBytes(buffer)) {
    return {
      ok: false,
      response: routeJson({ error: 'Invalid certificate file' }, 400),
    };
  }

  return { ok: true, upload: { file, buffer } };
}

/**
 * GET /api/instruments/[id]/certificates
 * List all certificate files for an instrument.
 */
async function getHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return routeJson({ error: 'Invalid instrument ID format' }, 400);
    }

    const ownership = await ensureOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    const { data: certRows, error: certError } = await scopedCertificateQuery(
      auth,
      id
    ).order('created_at', { ascending: false });

    if (certError) {
      logError('Certificate list error:', certError);
      return routeJson({ error: 'Failed to list certificate files' }, 500);
    }

    if (!certRows || certRows.length === 0) {
      return routeJson({ data: [] }, 200);
    }

    const certificateFiles = [];

    for (const row of certRows as ScopedCertificateRow[]) {
      const fileKey = row.storage_path?.trim();

      if (!fileKey) {
        logError('Certificate object missing storage path', {
          instrumentId: id,
          certificateId: row.id,
        });
        return routeJson({ error: 'Media object not found' }, 404);
      }

      let exists = false;
      try {
        exists = await storage.fileExists(fileKey);
      } catch (error) {
        logError('Failed to verify certificate object', {
          instrumentId: id,
          certificateId: row.id,
          fileKey,
          error: error instanceof Error ? error.message : String(error),
        });
        return routeJson({ error: 'Failed to verify media object' }, 500);
      }

      if (!exists) {
        logError('Certificate object not found', {
          instrumentId: id,
          certificateId: row.id,
          fileKey,
        });
        return routeJson({ error: 'Media object not found' }, 404);
      }

      if (!storage.presignGet) {
        logError('Certificate presign unavailable', {
          instrumentId: id,
          certificateId: row.id,
          fileKey,
        });
        return routeJson({ error: 'Failed to generate access URL' }, 500);
      }

      let signedUrl = '';
      try {
        signedUrl = await storage.presignGet(fileKey, SIGNED_URL_TTL_SECONDS);
      } catch (error) {
        logError('Failed to generate certificate access URL', {
          instrumentId: id,
          certificateId: row.id,
          fileKey,
          error: error instanceof Error ? error.message : String(error),
        });
        return routeJson({ error: 'Failed to generate access URL' }, 500);
      }

      if (!signedUrl.trim()) {
        logError('Certificate access URL was empty', {
          instrumentId: id,
          certificateId: row.id,
          fileKey,
        });
        return routeJson({ error: 'Failed to generate access URL' }, 500);
      }

      const name = row.original_name || getStorageFilename(fileKey);

      certificateFiles.push({
        id: row.id,
        name,
        path: fileKey,
        size: row.size || 0,
        createdAt: row.created_at || null,
        signedUrl,
      });
    }

    return routeJson({ data: certificateFiles }, 200);
  } catch (error) {
    logError('Certificate list error:', error);
    return routeJson(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list certificates',
      },
      500
    );
  }
}

/**
 * POST /api/instruments/[id]/certificates
 * Upload certificate file for an instrument.
 */
async function postHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return routeJson({ error: 'Invalid instrument ID format' }, 400);
    }

    const ownership = await ensureAdminOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    await assertInstrumentsSchemaReadiness({ supabase: auth.userSupabase });

    const uploadRateLimitResult = await applyScopedRateLimit(uploadRateLimit, {
      orgId: auth.orgId,
      userId: auth.user.id,
      method: 'POST',
      routeKey: 'instruments/:id/certificates',
      ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });
    if (uploadRateLimitResult.limited) {
      return routeJson({ error: 'Too many requests' }, 429);
    }

    const validation = await validateCertificateUploadFromRequest(request);
    if (!validation.ok) {
      return validation.response;
    }

    const { file, buffer } = validation.upload;

    storage.validateFile(file.name, 'application/pdf', file.size);

    const fileKey = getCertificateStorageKey(auth.orgId!, id, file.name);

    let canonicalStoredKey: string;
    try {
      canonicalStoredKey = await storage.saveFile(
        buffer,
        fileKey,
        'application/pdf'
      );
    } catch (uploadError) {
      logError('Certificate upload error:', uploadError);
      throw new Error(
        `Failed to upload certificate: ${
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError)
        }`
      );
    }

    if (!canonicalStoredKey) {
      throw new Error('Certificate upload did not return a storage key');
    }

    let insertedId: string | null = null;

    const { data: createdCertificateId, error: insertError } =
      await auth.userSupabase.rpc('create_instrument_certificate_metadata', {
        p_instrument_id: id,
        p_storage_path: canonicalStoredKey,
        p_original_name: file.name,
        p_mime_type: 'application/pdf',
        p_size: file.size,
        p_created_by: auth.user.id,
      });

    if (insertError) {
      await rollbackUploadedCertificate(
        canonicalStoredKey,
        'Failed to rollback certificate upload after metadata insert error:'
      );

      throw errorHandler.handleSupabaseError(
        insertError,
        'Save certificate metadata'
      );
    }

    insertedId =
      typeof createdCertificateId === 'string' ? createdCertificateId : null;

    let signedUrl = '';
    try {
      signedUrl = storage.presignGet
        ? await storage.presignGet(canonicalStoredKey, SIGNED_URL_TTL_SECONDS)
        : storage.getFileUrl(canonicalStoredKey);
    } catch (presignError) {
      logError('Failed to generate presigned URL:', presignError);
      signedUrl = storage.getFileUrl(canonicalStoredKey);
    }

    return routeJson({
      success: true,
      id: insertedId,
      filePath: canonicalStoredKey,
      publicUrl: signedUrl,
      message: 'Certificate uploaded successfully',
    });
  } catch (error) {
    logError('Certificate upload error:', error);
    return routeJson(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload certificate',
      },
      500
    );
  }
}

/**
 * PUT /api/instruments/[id]/certificates?file=...
 * Replace an existing certificate file with a new PDF.
 */
async function putHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return routeJson({ error: 'Invalid instrument ID format' }, 400);
    }

    const url = new URL(request.url);
    const fileName = url.searchParams.get('file');
    if (!fileName) {
      return routeJson({ error: 'File name is required' }, 400);
    }

    const ownership = await ensureAdminOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    await assertInstrumentsSchemaReadiness({ supabase: auth.userSupabase });

    const uploadRateLimitResult = await applyScopedRateLimit(uploadRateLimit, {
      orgId: auth.orgId,
      userId: auth.user.id,
      method: 'PUT',
      routeKey: 'instruments/:id/certificates',
      ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });
    if (uploadRateLimitResult.limited) {
      return routeJson({ error: 'Too many requests' }, 429);
    }

    const validation = await validateCertificateUploadFromRequest(request);
    if (!validation.ok) {
      return validation.response;
    }

    const { file, buffer } = validation.upload;

    const { data: certRows, error: certError } = await scopedCertificateQuery(
      auth,
      id
    ).order('created_at', { ascending: false });

    if (certError) {
      return routeJson({ error: 'Failed to find certificate files' }, 404);
    }

    const existing = (certRows as ScopedCertificateRow[] | null)?.find(
      row => getStorageFilename(row.storage_path) === fileName
    );

    if (!existing) {
      return routeJson({ error: 'Certificate file not found' }, 404);
    }

    const oldFileKey = existing.storage_path;
    const expectedCertificateId = existing.id;
    const fileKey = getCertificateStorageKey(auth.orgId!, id, file.name);

    storage.validateFile(file.name, 'application/pdf', file.size);

    let canonicalStoredKey: string;
    try {
      canonicalStoredKey = await storage.saveFile(
        buffer,
        fileKey,
        'application/pdf'
      );
    } catch (uploadError) {
      logError('Certificate replace error:', uploadError);
      throw new Error(
        `Failed to replace certificate: ${
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError)
        }`
      );
    }

    if (!canonicalStoredKey) {
      throw new Error('Certificate replacement did not return a storage key');
    }

    const { data: updatedRow, error: updateMetaError } = await auth.userSupabase
      .from('instrument_certificates')
      .update({
        storage_path: canonicalStoredKey,
        original_name: file.name,
        mime_type: 'application/pdf',
        size: file.size,
      })
      .eq('id', expectedCertificateId)
      .eq('instrument_id', id)
      .eq('storage_path', oldFileKey)
      .select('id, storage_path')
      .maybeSingle();

    if (updateMetaError) {
      await rollbackUploadedCertificate(
        canonicalStoredKey,
        'Failed to rollback replaced certificate upload:'
      );

      throw errorHandler.handleSupabaseError(
        updateMetaError,
        'Update certificate metadata'
      );
    }

    if (!updatedRow) {
      await rollbackUploadedCertificate(
        canonicalStoredKey,
        'Failed to rollback replaced certificate upload after concurrent change:'
      );

      return routeJson(
        {
          error: 'Certificate changed by another request. Refresh and retry.',
        },
        409
      );
    }

    if (oldFileKey !== canonicalStoredKey) {
      try {
        await storage.deleteFile(oldFileKey);
      } catch (deleteError) {
        logError('Failed to delete legacy certificate path:', deleteError);

        return routeJson(
          {
            error:
              'Failed to delete previous certificate file from storage. Please retry.',
            filePath: canonicalStoredKey,
            cleanup: {
              oldStorageDeleted: false,
            },
          },
          503
        );
      }
    }

    let signedUrl = '';
    try {
      signedUrl = storage.presignGet
        ? await storage.presignGet(canonicalStoredKey, SIGNED_URL_TTL_SECONDS)
        : storage.getFileUrl(canonicalStoredKey);
    } catch (presignError) {
      logError('Failed to generate presigned URL:', presignError);
      signedUrl = storage.getFileUrl(canonicalStoredKey);
    }

    return routeJson({
      success: true,
      filePath: canonicalStoredKey,
      publicUrl: signedUrl,
      message: 'Certificate replaced successfully',
      cleanup: {
        oldStorageDeleted: true,
      },
    });
  } catch (error) {
    logError('Certificate replace error:', error);
    return routeJson(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to replace certificate',
      },
      500
    );
  }
}

/**
 * DELETE /api/instruments/[id]/certificates
 * Delete a specific certificate file for an instrument.
 */
async function deleteHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return routeJson({ error: 'Invalid instrument ID format' }, 400);
    }

    const url = new URL(request.url);
    const fileName = url.searchParams.get('file');
    const certificateId = url.searchParams.get('id');

    if (!fileName && !certificateId) {
      return routeJson(
        { error: 'File name or certificate id is required' },
        400
      );
    }

    const ownership = await ensureAdminOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    await assertInstrumentsSchemaReadiness({ supabase: auth.userSupabase });

    const deleteRateLimitResult = await applyScopedRateLimit(
      destructiveMutationRateLimit,
      {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'DELETE',
        routeKey: 'instruments/:id/certificates',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      }
    );
    if (deleteRateLimitResult.limited) {
      return routeJson({ error: 'Too many requests' }, 429);
    }

    let filePath: string | null = null;
    let deleteByCertificateId: string | null = null;

    if (certificateId) {
      if (!validateUUID(certificateId)) {
        return routeJson({ error: 'Invalid certificate id format' }, 400);
      }

      deleteByCertificateId = certificateId;
    }

    if (!deleteByCertificateId && fileName) {
      const { data: certRows, error: certError } = await scopedCertificateQuery(
        auth,
        id
      );

      if (certError) {
        return routeJson({ error: 'Failed to find certificate files' }, 404);
      }

      const existing = (certRows as ScopedCertificateRow[] | null)?.find(
        row => getStorageFilename(row.storage_path) === fileName
      );

      if (!existing) {
        return routeJson({ error: 'Certificate file not found' }, 404);
      }

      deleteByCertificateId = existing.id;
      filePath = existing.storage_path;
    }

    if (!deleteByCertificateId) {
      return routeJson(
        { error: 'File name or certificate id is required' },
        400
      );
    }

    const { data: deletedRow, error: deleteMetaError } = await auth.userSupabase
      .from('instrument_certificates')
      .delete()
      .eq('id', deleteByCertificateId)
      .eq('instrument_id', id)
      .select('id, storage_path')
      .maybeSingle();

    if (deleteMetaError) {
      logError('Certificate metadata delete error:', deleteMetaError);
      return routeJson(
        { error: 'Failed to delete certificate metadata. Please retry.' },
        500
      );
    }

    if (!deletedRow) {
      return routeJson(
        {
          error: 'Certificate changed by another request. Refresh and retry.',
        },
        409
      );
    }

    filePath = deletedRow.storage_path;

    let storageDeleted = false;
    try {
      const deleteResult = await storage.deleteFile(filePath);
      storageDeleted = deleteResult !== false;
    } catch (deleteError) {
      logError(
        'Certificate storage cleanup failed (metadata already removed):',
        {
          instrumentId: id,
          certificateId: deleteByCertificateId,
          filePath,
          error:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        }
      );
    }

    if (!storageDeleted) {
      return routeJson({
        result: 'partial_success',
        message:
          'Certificate removed from the app, but storage cleanup failed.',
        cleanup: {
          storageDeleted: false,
        },
      });
    }

    return routeJson({
      result: 'full_success',
      message: 'Certificate deleted successfully',
      cleanup: {
        storageDeleted: true,
      },
    });
  } catch (error) {
    logError('Certificate delete error:', error);
    return routeJson(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete certificate',
      },
      500
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;

  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return apiHandler(
        ensureRequestWithNextUrl(req),
        {
          method: 'GET',
          path: `InstrumentCertificatesAPI:${id}`,
          context: 'InstrumentCertificatesAPI',
        },
        async () =>
          responseToApiHandlerResult(await getHandlerInternal(req, auth, id))
      );
    })
  );

  return handler(request);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;

  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return apiHandler(
        ensureRequestWithNextUrl(req),
        {
          method: 'POST',
          path: `InstrumentCertificatesAPI:${id}`,
          context: 'InstrumentCertificatesAPI',
        },
        async () =>
          responseToApiHandlerResult(await postHandlerInternal(req, auth, id))
      );
    })
  );

  return handler(request);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;

  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return apiHandler(
        ensureRequestWithNextUrl(req),
        {
          method: 'PUT',
          path: `InstrumentCertificatesAPI:${id}`,
          context: 'InstrumentCertificatesAPI',
        },
        async () =>
          responseToApiHandlerResult(await putHandlerInternal(req, auth, id))
      );
    })
  );

  return handler(request);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;

  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return apiHandler(
        ensureRequestWithNextUrl(req),
        {
          method: 'DELETE',
          path: `InstrumentCertificatesAPI:${id}`,
          context: 'InstrumentCertificatesAPI',
        },
        async () =>
          responseToApiHandlerResult(await deleteHandlerInternal(req, auth, id))
      );
    })
  );

  return handler(request);
}
