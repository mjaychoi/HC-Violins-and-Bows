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
const SIGNED_URL_TTL_SECONDS = 600;
const MAX_CERTIFICATE_SIZE = 100 * 1024 * 1024;

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
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\s+/g, '_');
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

// Note: S3Storage doesn't have list functionality, so we rely on metadata table only

/**
 * GET /api/instruments/[id]/certificates
 * List all certificate files for an instrument
 */
async function getHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    // Validate UUID
    if (!validateUUID(id)) {
      return routeJson({ error: 'Invalid instrument ID format' }, 400);
    }

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const ownership = await ensureOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    const { data: certRows, error: certError } = await scopedCertificateQuery(
      auth,
      id
    ).order('created_at', { ascending: false });

    if (!certError && certRows && certRows.length > 0) {
      const certificateFiles = await Promise.all(
        (certRows as ScopedCertificateRow[]).map(async row => {
          const fileKey = row.storage_path;
          let signedUrl = '';
          try {
            signedUrl = storage.presignGet
              ? await storage.presignGet(fileKey, SIGNED_URL_TTL_SECONDS)
              : storage.getFileUrl(fileKey);
          } catch (presignError) {
            logError('Failed to generate presigned URL:', presignError);
          }
          const name = row.original_name || getStorageFilename(fileKey);
          return {
            id: row.id,
            name,
            path: fileKey,
            size: row.size || 0,
            createdAt: row.created_at || null,
            signedUrl: signedUrl || null,
          };
        })
      );

      return routeJson({ data: certificateFiles }, 200);
    }

    if (certError) {
      logError('Certificate list error:', certError);
      return routeJson({ error: 'Failed to list certificate files' }, 500);
    }

    // No certificates found
    return routeJson({ data: [] }, 200);
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
 * Upload certificate file for an instrument
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

    const formData = await request.formData();
    const file = formData.get('certificate') as File | null;

    if (!file) {
      return routeJson({ error: 'No certificate file provided' }, 400);
    }

    const normalizedType = (file.type || '').toLowerCase();
    const isPdfType =
      normalizedType === 'application/pdf' ||
      normalizedType === 'application/x-pdf';
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType && !hasPdfExtension) {
      return routeJson({ error: 'Certificate must be a PDF file' }, 400);
    }

    if (file.size > MAX_CERTIFICATE_SIZE) {
      return routeJson(
        { error: 'Certificate file size must be less than 100MB' },
        400
      );
    }

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    const ownership = await ensureOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileKey = getCertificateStorageKey(auth.orgId!, id, file.name);

    // Validate file before upload
    storage.validateFile(file.name, 'application/pdf', file.size);

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
      try {
        await storage.deleteFile(canonicalStoredKey);
      } catch (deleteError) {
        logError('Failed to rollback file upload:', deleteError);
      }
      throw errorHandler.handleSupabaseError(
        insertError,
        'Save certificate metadata'
      );
    }

    insertedId =
      typeof createdCertificateId === 'string' ? createdCertificateId : null;

    const { error: updateError } = await auth.userSupabase
      .from('instruments')
      .update({ certificate: true })
      .eq('id', id)
      .eq('org_id', auth.orgId!);

    if (updateError) {
      if (insertedId) {
        await auth.userSupabase
          .from('instrument_certificates')
          .delete()
          .eq('id', insertedId);
      }
      try {
        await storage.deleteFile(canonicalStoredKey);
      } catch (deleteError) {
        logError('Failed to rollback file upload:', deleteError);
      }
      throw errorHandler.handleSupabaseError(updateError, 'Update instrument');
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
 * Replace an existing certificate file with a new PDF
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

    const formData = await request.formData();
    const file = formData.get('certificate') as File | null;

    if (!file) {
      return routeJson({ error: 'No certificate file provided' }, 400);
    }

    const normalizedType = (file.type || '').toLowerCase();
    const isPdfType =
      normalizedType === 'application/pdf' ||
      normalizedType === 'application/x-pdf';
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType && !hasPdfExtension) {
      return routeJson({ error: 'Certificate must be a PDF file' }, 400);
    }

    if (file.size > MAX_CERTIFICATE_SIZE) {
      return routeJson(
        { error: 'Certificate file size must be less than 100MB' },
        400
      );
    }

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    const ownership = await ensureOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    // Find certificate by fileName in metadata table
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
    const fileKey = getCertificateStorageKey(auth.orgId!, id, file.name);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file before upload
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

    // org_id is enforced via RLS (join through instruments) and ensureOwnedInstrument.
    // instrument_certificates has no direct org_id column; instrument_id + storage_path
    // is the narrowest safe scope available at the application layer.
    const { error: updateMetaError } = await auth.userSupabase
      .from('instrument_certificates')
      .update({
        storage_path: canonicalStoredKey,
        original_name: file.name,
        mime_type: 'application/pdf',
        size: file.size,
      })
      .eq('instrument_id', id)
      .eq('storage_path', oldFileKey);

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

    if (oldFileKey !== canonicalStoredKey) {
      try {
        await storage.deleteFile(oldFileKey);
      } catch (deleteError) {
        logError('Failed to delete legacy certificate path:', deleteError);
        return routeJson(
          {
            error:
              'Failed to delete previous certificate file from storage. Please retry.',
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
 * Delete a specific certificate file for an instrument
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

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    const ownership = await ensureOwnedInstrument(auth, id);
    if ('response' in ownership) return ownership.response;

    let filePath: string | null = null;
    let deleteByCertificateId: string | null = null;

    if (certificateId) {
      const { data: certRow, error: certError } = await auth.userSupabase
        .from('instrument_certificates')
        .select('id, storage_path, instruments!inner(org_id)')
        .eq('id', certificateId)
        .eq('instrument_id', id)
        .eq('instruments.org_id', auth.orgId!)
        .single();

      if (certError) {
        logError('Certificate lookup error:', certError);
        return routeJson({ error: 'Failed to find certificate file' }, 404);
      }

      filePath = certRow?.storage_path || null;
      deleteByCertificateId = certificateId;
    }

    if (!filePath && fileName) {
      // Find certificate by fileName in metadata table
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

      filePath = existing.storage_path;
    }

    if (!filePath) {
      return routeJson(
        { error: 'Certificate storage path could not be resolved' },
        500
      );
    }

    // Delete DB metadata first. If storage cleanup fails afterward it is
    // best-effort — a stale storage object is less harmful than a DB record
    // that points to a file that no longer exists.
    const deleteMetaQuery = deleteByCertificateId
      ? auth.userSupabase
          .from('instrument_certificates')
          .delete()
          .eq('id', deleteByCertificateId)
          .eq('instrument_id', id)
      : auth.userSupabase
          .from('instrument_certificates')
          .delete()
          .eq('instrument_id', id)
          .eq('storage_path', filePath);

    const { error: deleteMetaError } = await deleteMetaQuery;

    if (deleteMetaError) {
      logError('Certificate metadata delete error:', deleteMetaError);
      return routeJson(
        { error: 'Failed to delete certificate metadata. Please retry.' },
        500
      );
    }

    let storageDeleted = false;
    try {
      storageDeleted = Boolean(await storage.deleteFile(filePath));
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

    // Check if any certificates remain using metadata table
    const { data: remainingCerts } = await auth.userSupabase
      .from('instrument_certificates')
      .select('id')
      .eq('instrument_id', id)
      .limit(1);

    if (!remainingCerts || remainingCerts.length === 0) {
      const { error: updateError } = await auth.userSupabase
        .from('instruments')
        .update({ certificate: false })
        .eq('id', id)
        .eq('org_id', auth.orgId!);

      if (updateError) {
        logError('Failed to update instrument certificate flag:', updateError);
        return routeJson(
          {
            error:
              'Certificate file and metadata were deleted, but the instrument certificate flag update failed. Please retry or reconcile the instrument state.',
          },
          500
        );
      }
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
  // FIXED: Next.js 15+ route handlers: params is Promise<{ id: string }>
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  // Wrap handler with auth and sentry
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
