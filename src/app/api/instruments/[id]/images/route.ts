import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { errorHandler } from '@/utils/errorHandler';
import { validateUUID } from '@/utils/inputValidation';
import type { InstrumentImage } from '@/types';
import { getStorage } from '@/utils/storage';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { logError } from '@/utils/logger';
import { ErrorCodes } from '@/types/errors';
import { assertInstrumentImagesSchemaReadiness } from '@/app/api/_utils/schemaReadiness';

export const runtime = 'nodejs';

// Limits
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per image
const MAX_IMAGE_FILES_PER_REQUEST = 10;
const MAX_TOTAL_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB total per request

// Signed URL TTL
const SIGNED_URL_TTL_SECONDS = 600;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const getParams = async (context?: { params?: Promise<{ id: string }> }) => {
  if (!context?.params) {
    return { id: '' };
  }

  return await context.params;
};

type UploadFileLike = {
  name?: string;
  type?: string;
  size?: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type ValidatedImageUpload = {
  file: UploadFileLike;
  originalFileName: string;
  normalizedType: string;
  fileSize: number;
  extension: string;
};

/**
 * Legacy helper: if public URLs are stored in DB, derive storage path.
 * NOTE: This will NOT work for signed URLs. Prefer storage_key/file_name.
 */
const getStoragePathFromPublicUrl = (url: string): string | null => {
  const supabaseMarker = '/storage/v1/object/public/instrument-images/';
  const supabaseIdx = url.indexOf(supabaseMarker);

  if (supabaseIdx !== -1) {
    return url.slice(supabaseIdx + supabaseMarker.length);
  }

  // S3 URL pattern:
  // https://bucket.s3.region.amazonaws.com/key
  const s3Pattern = /https?:\/\/([^.]+)\.s3[.-]([^.]+)\.amazonaws\.com\/(.+)/;
  const s3Match = url.match(s3Pattern);

  if (s3Match && s3Match[3]) {
    return decodeURIComponent(s3Match[3]);
  }

  return null;
};

function resolveLegacyStorageKey(
  storageKey: string | null | undefined,
  imageUrl: string | null | undefined
): string | null {
  if (typeof storageKey === 'string' && storageKey.trim()) {
    return storageKey.trim();
  }

  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    return getStoragePathFromPublicUrl(imageUrl.trim());
  }

  return null;
}

function sanitizeImageBaseName(input: string): string {
  const baseName = input.replace(/\.[^/.]+$/, '');

  const sanitized = baseName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 120);

  return sanitized || 'image';
}

function getInstrumentImageStorageKey(
  orgId: string,
  instrumentId: string,
  fileName: string
): string {
  return `${orgId}/${instrumentId}/${fileName}`;
}

function stripInstrumentScope<T extends { instruments?: unknown }>(
  row: T
): Omit<T, 'instruments'> {
  const rest = { ...row };
  delete rest.instruments;
  return rest;
}

function normalizeUploadMimeType(file: UploadFileLike): string | null {
  const mimeType = (file.type || '').toLowerCase();
  let normalizedType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

  const originalFileName = typeof file.name === 'string' ? file.name : '';
  const extension = originalFileName.split('.').pop()?.toLowerCase() || '';

  if (!ALLOWED_MIME_TYPES[normalizedType]) {
    const inferredType = EXTENSION_MIME_TYPES[extension];
    if (inferredType) {
      normalizedType = inferredType;
    }
  }

  return ALLOWED_MIME_TYPES[normalizedType] ? normalizedType : null;
}

function validateImageUploads(
  files: UploadFileLike[]
): ValidatedImageUpload[] | NextResponse {
  if (!files || files.length === 0) {
    return createApiErrorResponse({ message: 'No image files provided' }, 400);
  }

  if (files.length > MAX_IMAGE_FILES_PER_REQUEST) {
    return createApiErrorResponse(
      {
        message: `Cannot upload more than ${MAX_IMAGE_FILES_PER_REQUEST} images at once`,
      },
      400
    );
  }

  let totalSize = 0;
  const validated: ValidatedImageUpload[] = [];

  for (const file of files) {
    if (!file) {
      return createApiErrorResponse(
        { message: 'Invalid image file payload' },
        400
      );
    }

    const originalFileName = typeof file.name === 'string' ? file.name : '';
    const fileSize = file.size ?? 0;

    if (!originalFileName || typeof file.arrayBuffer !== 'function') {
      return createApiErrorResponse(
        { message: 'Invalid image file payload' },
        400
      );
    }

    if (fileSize <= 0) {
      return createApiErrorResponse({ message: 'Image file is empty' }, 400);
    }

    if (fileSize > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        { message: 'Image file size must be less than 5MB' },
        400
      );
    }

    totalSize += fileSize;
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
      return createApiErrorResponse(
        {
          message: `Total image upload size must be less than ${Math.round(
            MAX_TOTAL_UPLOAD_SIZE / 1024 / 1024
          )}MB`,
        },
        400
      );
    }

    const normalizedType = normalizeUploadMimeType(file);
    if (!normalizedType) {
      return createApiErrorResponse({ message: 'Unsupported image type' }, 400);
    }

    validated.push({
      file,
      originalFileName,
      normalizedType,
      fileSize,
      extension: ALLOWED_MIME_TYPES[normalizedType],
    });
  }

  return validated;
}

function isSchemaOutOfDateError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === ErrorCodes.SCHEMA_OUT_OF_DATE
  );
}

function createSchemaOutOfDateResponse(error: unknown): NextResponse {
  return createApiErrorResponse(
    {
      message: 'Database migration required.',
      error_code: ErrorCodes.SCHEMA_OUT_OF_DATE,
      retryable: false,
      details:
        process.env.NODE_ENV === 'development' &&
        error &&
        typeof error === 'object' &&
        'details' in error
          ? (error as { details?: unknown }).details
          : undefined,
    },
    503
  );
}

async function ensureOwnedInstrument(
  auth: AuthContext,
  id: string
): Promise<NextResponse | null> {
  const orgContextError = requireOrgContext(auth);
  if (orgContextError) return orgContextError;

  const { data: instrument, error } = await auth.userSupabase
    .from('instruments')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId!)
    .single();

  if (error || !instrument) {
    return createApiErrorResponse({ message: 'Instrument not found' }, 404);
  }

  return null;
}

async function ensureAdminOwnedInstrument(
  auth: AuthContext,
  id: string
): Promise<NextResponse | null> {
  const orgContextError = requireOrgContext(auth);
  if (orgContextError) return orgContextError;

  const adminError = requireAdmin(auth);
  if (adminError) return adminError;

  return ensureOwnedInstrument(auth, id);
}

async function getHandlerInternal(
  _request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return createApiErrorResponse(
        { message: 'Invalid instrument ID format' },
        400
      );
    }

    const ownershipError = await ensureOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

    await assertInstrumentImagesSchemaReadiness({
      supabase: auth.userSupabase,
    });

    const { data, error } = await auth.userSupabase
      .from('instrument_images')
      .select(
        'id, instrument_id, image_url, storage_key, file_name, file_size, mime_type, display_order, created_at, instruments!inner(org_id)'
      )
      .eq('instrument_id', id)
      .eq('instruments.org_id', auth.orgId!)
      .order('display_order', { ascending: true });

    if (error) {
      throw errorHandler.handleSupabaseError(error, 'Fetch instrument images');
    }

    const images = (
      (data || []) as Array<InstrumentImage & { instruments?: unknown }>
    ).map(image => stripInstrumentScope(image));

    const signedImages: InstrumentImage[] = [];

    for (const image of images) {
      const fileKey = resolveLegacyStorageKey(
        (image as InstrumentImage & { storage_key?: string | null })
          .storage_key,
        image.image_url
      );

      if (!fileKey) {
        logError('Instrument image object missing storage key', {
          instrumentId: id,
          imageId: image.id,
          imageUrl: image.image_url ?? null,
        });

        return createApiErrorResponse(
          { message: 'Media object not found' },
          404
        );
      }

      let exists = false;
      try {
        exists = await storage.fileExists(fileKey);
      } catch (error) {
        logError('Failed to verify instrument image object', {
          instrumentId: id,
          imageId: image.id,
          fileKey,
          error: error instanceof Error ? error.message : String(error),
        });

        return createApiErrorResponse(
          { message: 'Failed to verify media object' },
          500
        );
      }

      if (!exists) {
        logError('Instrument image object not found', {
          instrumentId: id,
          imageId: image.id,
          fileKey,
        });

        return createApiErrorResponse(
          { message: 'Media object not found' },
          404
        );
      }

      if (!storage.presignGet) {
        logError('Instrument image presign unavailable', {
          instrumentId: id,
          imageId: image.id,
          fileKey,
        });

        return createApiErrorResponse(
          { message: 'Failed to generate access URL' },
          500
        );
      }

      let signedUrl = '';
      try {
        signedUrl = await storage.presignGet(fileKey, SIGNED_URL_TTL_SECONDS);
      } catch (error) {
        logError('Failed to generate instrument image access URL', {
          instrumentId: id,
          imageId: image.id,
          fileKey,
          error: error instanceof Error ? error.message : String(error),
        });

        return createApiErrorResponse(
          { message: 'Failed to generate access URL' },
          500
        );
      }

      if (!signedUrl.trim()) {
        logError('Instrument image access URL was empty', {
          instrumentId: id,
          imageId: image.id,
          fileKey,
        });

        return createApiErrorResponse(
          { message: 'Failed to generate access URL' },
          500
        );
      }

      signedImages.push({ ...image, image_url: signedUrl });
    }

    return NextResponse.json({ data: signedImages });
  } catch (error) {
    if (isSchemaOutOfDateError(error)) {
      return createSchemaOutOfDateResponse(error);
    }

    return createApiErrorResponse(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch instrument images',
      },
      500
    );
  }
}

/**
 * POST /api/instruments/[id]/images
 * Upload one or more images for an instrument.
 */
async function postHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return createApiErrorResponse(
        { message: 'Invalid instrument ID format' },
        400
      );
    }

    const ownershipError = await ensureAdminOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

    await assertInstrumentImagesSchemaReadiness({
      supabase: auth.userSupabase,
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiErrorResponse(
        { message: 'Invalid multipart form data' },
        400
      );
    }

    const files = formData.getAll('images') as UploadFileLike[];
    const validatedUploads = validateImageUploads(files);

    if (!Array.isArray(validatedUploads)) {
      return validatedUploads;
    }

    const committed: Array<{ storedKey: string; insertedId: string }> = [];

    async function rollbackAll() {
      for (const { storedKey, insertedId } of committed) {
        try {
          await auth.userSupabase
            .from('instrument_images')
            .delete()
            .eq('id', insertedId)
            .eq('instrument_id', id);
        } catch (e) {
          logError('rollback: failed to delete DB record', {
            insertedId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        try {
          await storage.deleteFile(storedKey);
        } catch (e) {
          logError('rollback: failed to delete storage file', {
            storedKey,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const uploads: InstrumentImage[] = [];

    for (const upload of validatedUploads) {
      const { file, originalFileName, normalizedType, fileSize, extension } =
        upload;

      const arrayBuffer = await file.arrayBuffer!();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length <= 0) {
        await rollbackAll();
        return createApiErrorResponse({ message: 'Image file is empty' }, 400);
      }

      const safeName = sanitizeImageBaseName(originalFileName);
      const fileNameBase = `${Date.now()}-${randomUUID()}-${safeName}`;
      const fileName = `${fileNameBase}.${extension}`;
      const fileKey = getInstrumentImageStorageKey(auth.orgId!, id, fileName);

      let storedKey: string;
      let storedFileName: string;

      try {
        storage.validateFile?.(originalFileName, normalizedType, fileSize);

        storedKey = await storage.saveFile(buffer, fileKey, normalizedType);
        if (typeof storedKey !== 'string' || !storedKey.trim()) {
          throw new Error('Storage upload did not return a file key');
        }
        storedFileName = storedKey.split('/').pop() ?? fileName;
      } catch (uploadError) {
        await rollbackAll();

        throw new Error(
          `Failed to upload image: ${
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError)
          }`
        );
      }

      const publicUrl = storage.getFileUrl(storedKey);

      const { data: insertedId, error: insertError } =
        await auth.userSupabase.rpc('create_instrument_image_metadata', {
          p_instrument_id: id,
          p_image_url: publicUrl,
          p_storage_key: storedKey,
          p_file_name: storedFileName,
          p_file_size: fileSize,
          p_mime_type: normalizedType,
        });

      if (insertError || typeof insertedId !== 'string') {
        try {
          await storage.deleteFile(storedKey);
        } catch (e) {
          logError('rollback: failed to delete orphaned storage file', {
            storedKey,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        await rollbackAll();

        throw errorHandler.handleSupabaseError(
          insertError,
          'Save instrument image'
        );
      }

      committed.push({ storedKey, insertedId });

      const { data: inserted, error: fetchInsertedError } =
        await auth.userSupabase
          .from('instrument_images')
          .select('*, instruments!inner(org_id)')
          .eq('id', insertedId)
          .eq('instrument_id', id)
          .eq('instruments.org_id', auth.orgId!)
          .single();

      if (fetchInsertedError || !inserted) {
        await rollbackAll();

        throw errorHandler.handleSupabaseError(
          fetchInsertedError,
          'Fetch saved instrument image'
        );
      }

      let signedUrl: string;
      try {
        signedUrl = storage.presignGet
          ? await storage.presignGet(storedKey, SIGNED_URL_TTL_SECONDS)
          : publicUrl;
      } catch (presignError) {
        logError('Failed to generate presigned URL:', {
          error:
            presignError instanceof Error
              ? presignError.message
              : String(presignError),
        });

        signedUrl = inserted.image_url || publicUrl;
      }

      uploads.push({
        ...stripInstrumentScope(
          inserted as unknown as InstrumentImage & { instruments?: unknown }
        ),
        image_url: signedUrl,
      });
    }

    return NextResponse.json({
      data: uploads,
      metadata: {
        uploadedCount: uploads.length,
      },
    });
  } catch (error) {
    if (isSchemaOutOfDateError(error)) {
      return createSchemaOutOfDateResponse(error);
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message?: string }).message)
          : 'Failed to upload instrument images';

    const errorDetails =
      typeof error === 'object' &&
      error &&
      'details' in error &&
      typeof (error as { details?: unknown }).details === 'string'
        ? String((error as { details?: string }).details)
        : undefined;

    logError('Instrument image upload error:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createApiErrorResponse(
      {
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && errorDetails
          ? { details: errorDetails }
          : {}),
      },
      500
    );
  }
}

/**
 * DELETE /api/instruments/[id]/images?imageId=...
 * Delete a specific image for an instrument.
 */
async function deleteHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    if (!validateUUID(id)) {
      return createApiErrorResponse(
        { message: 'Invalid instrument ID format' },
        400
      );
    }

    const ownershipError = await ensureAdminOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

    await assertInstrumentImagesSchemaReadiness({
      supabase: auth.userSupabase,
    });

    const url = new URL(request.url);
    const imageId = url.searchParams.get('imageId');

    if (!imageId || !validateUUID(imageId)) {
      return createApiErrorResponse({ message: 'Invalid image ID' }, 400);
    }

    const { data: image, error: imageError } = await auth.userSupabase
      .from('instrument_images')
      .select('*, instruments!inner(org_id)')
      .eq('id', imageId)
      .eq('instrument_id', id)
      .eq('instruments.org_id', auth.orgId!)
      .single();

    if (imageError || !image) {
      return createApiErrorResponse({ message: 'Image not found' }, 404);
    }

    const fileKey = resolveLegacyStorageKey(image.storage_key, image.image_url);

    if (!fileKey) {
      logError(
        'Instrument image deletion blocked: storage key could not be resolved',
        {
          imageId,
          instrumentId: id,
        }
      );

      return createApiErrorResponse(
        { message: 'Image storage key could not be resolved' },
        409
      );
    }

    // Delete DB record first. Storage cleanup is best-effort and reflected in payload.
    // Do not filter by org_id here unless instrument_images has a direct org_id column.
    // Tenant scope is established by the prior instruments!inner(org_id) lookup.
    const { error: deleteError } = await auth.userSupabase
      .from('instrument_images')
      .delete()
      .eq('id', imageId)
      .eq('instrument_id', id);

    if (deleteError) {
      throw errorHandler.handleSupabaseError(
        deleteError,
        'Delete instrument image'
      );
    }

    let storageDeleted = false;

    try {
      storageDeleted = Boolean(await storage.deleteFile(fileKey));
    } catch (storageDeleteError) {
      logError('Storage delete failed after DB delete', {
        instrumentId: id,
        imageId,
        fileKey,
        error:
          storageDeleteError instanceof Error
            ? storageDeleteError.message
            : String(storageDeleteError),
      });
    }

    if (!storageDeleted) {
      return NextResponse.json({
        result: 'partial_success',
        message: 'Image removed from the app, but storage cleanup failed.',
        cleanup: {
          storageDeleted: false,
        },
      });
    }

    return NextResponse.json({
      result: 'full_success',
      message: 'Image deleted successfully.',
      cleanup: {
        storageDeleted: true,
      },
    });
  } catch (error) {
    if (isSchemaOutOfDateError(error)) {
      return createSchemaOutOfDateResponse(error);
    }

    return createApiErrorResponse(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to delete instrument image',
      },
      500
    );
  }
}

// GET /api/instruments/[id]/images
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await getParams(context);

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return getHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}

// POST /api/instruments/[id]/images
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await getParams(context);

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return postHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}

// DELETE /api/instruments/[id]/images?imageId=...
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await getParams(context);

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return deleteHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
