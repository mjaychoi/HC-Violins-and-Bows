import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { errorHandler } from '@/utils/errorHandler';
import { validateUUID } from '@/utils/inputValidation';
import { InstrumentImage } from '@/types';
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
// Limits
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Signed URL TTL
// 60초는 UI에서 금방 만료될 수 있어서, 10분 정도 권장
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

/**
 * Legacy helper: if you ever store public URLs in DB, you can derive storage path.
 * NOTE: This will NOT work for signed URLs. Use file_name when possible.
 * Also handles S3 URLs (s3://bucket/key or https://bucket.s3.region.amazonaws.com/key)
 */
const getStoragePathFromPublicUrl = (url: string): string | null => {
  // Supabase Storage URL marker
  const supabaseMarker = '/storage/v1/object/public/instrument-images/';
  const supabaseIdx = url.indexOf(supabaseMarker);
  if (supabaseIdx !== -1) {
    return url.slice(supabaseIdx + supabaseMarker.length);
  }

  // S3 URL patterns
  // https://bucket.s3.region.amazonaws.com/key or https://s3.region.amazonaws.com/bucket/key
  const s3Pattern = /https?:\/\/([^.]+)\.s3[.-]([^.]+)\.amazonaws\.com\/(.+)/;
  const s3Match = url.match(s3Pattern);
  if (s3Match && s3Match[3]) {
    return decodeURIComponent(s3Match[3]);
  }

  return null;
};

// this is a legacy function that is used to resolve the storage key from the image url
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

async function ensureOwnedInstrument(
  auth: AuthContext,
  id: string
): Promise<NextResponse | null> {
  if (!auth.orgId) {
    return createApiErrorResponse(
      { message: 'Organization context required' },
      403
    );
  }

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

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const ownershipError = await ensureOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

    // Fetch images for the instrument
    // Explicitly select columns (excluding alt_text which may not exist in all schemas)
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

    // Attach signed URLs (preferred for private buckets)
    const signedImages = await Promise.all(
      images.map(async image => {
        const fileKey = resolveLegacyStorageKey(
          (image as InstrumentImage & { storage_key?: string | null })
            .storage_key,
          image.image_url
        );

        if (fileKey) {
          try {
            const signedUrl = storage.presignGet
              ? await storage.presignGet(fileKey, SIGNED_URL_TTL_SECONDS)
              : storage.getFileUrl(fileKey);
            return { ...image, image_url: signedUrl };
          } catch (error) {
            logError(
              'Failed to generate presigned URL for',
              { fileKey, imageId: image.id },
              error instanceof Error ? error.message : String(error)
            );
            const fallbackUrl = image.image_url || storage.getFileUrl(fileKey);
            return { ...image, image_url: fallbackUrl };
          }
        }

        // Fallback: return as-is (image_url might be publicUrl)
        return image;
      })
    );

    return NextResponse.json({ data: signedImages });
  } catch (error) {
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
 * Upload one or more images for an instrument
 */
async function postHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    if (!validateUUID(id)) {
      return createApiErrorResponse(
        { message: 'Invalid instrument ID format' },
        400
      );
    }

    const ownershipError = await ensureOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

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

    if (!files || files.length === 0) {
      return createApiErrorResponse(
        { message: 'No image files provided' },
        400
      );
    }

    // Validate all files before touching storage or DB
    for (const file of files) {
      if (!file) {
        return createApiErrorResponse(
          { message: 'Invalid image file payload' },
          400
        );
      }

      const mimeType = (file.type || '').toLowerCase();
      let normalizedType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
      const originalFileName = typeof file.name === 'string' ? file.name : '';
      const extension = originalFileName.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_MIME_TYPES[normalizedType]) {
        const inferredType = EXTENSION_MIME_TYPES[extension];
        if (inferredType) normalizedType = inferredType;
      }
      if (!ALLOWED_MIME_TYPES[normalizedType]) {
        return createApiErrorResponse(
          { message: 'Unsupported image type' },
          400
        );
      }
      if ((file.size ?? 0) > MAX_FILE_SIZE) {
        return createApiErrorResponse(
          { message: 'Image file size must be less than 5MB' },
          400
        );
      }
      if (typeof file.arrayBuffer !== 'function' || !originalFileName) {
        return createApiErrorResponse(
          { message: 'Invalid image file payload' },
          400
        );
      }
    }

    // Tracks every committed (storage + DB) write so we can undo them all on failure.
    const committed: Array<{ storedKey: string; insertedId: string }> = [];

    async function rollbackAll() {
      for (const { storedKey, insertedId } of committed) {
        try {
          await auth.userSupabase
            .from('instrument_images')
            .delete()
            .eq('id', insertedId);
        } catch (e) {
          logError(
            'rollback: failed to delete DB record',
            { insertedId },
            e instanceof Error ? e.message : String(e)
          );
        }
        try {
          await storage.deleteFile(storedKey);
        } catch (e) {
          logError(
            'rollback: failed to delete storage file',
            { storedKey },
            e instanceof Error ? e.message : String(e)
          );
        }
      }
    }

    const uploads: InstrumentImage[] = [];

    for (const file of files) {
      const mimeType = (file.type || '').toLowerCase();
      let normalizedType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
      const originalFileName = typeof file.name === 'string' ? file.name : '';
      const extension = originalFileName.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_MIME_TYPES[normalizedType]) {
        const inferredType = EXTENSION_MIME_TYPES[extension];
        if (inferredType) normalizedType = inferredType;
      }
      const fileSize = file.size ?? 0;

      const arrayBuffer = await file.arrayBuffer!();
      const buffer = Buffer.from(arrayBuffer);
      const fileExt = ALLOWED_MIME_TYPES[normalizedType];

      const baseName = originalFileName.replace(/\.[^/.]+$/, '');
      const safeName = baseName
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/\s+/g, '_');
      const fileNameBase = `${Date.now()}-${randomUUID()}-${safeName}`;
      const fileName = `${fileNameBase}.${fileExt}`;
      const fileKey = getInstrumentImageStorageKey(auth.orgId!, id, fileName);

      let storedKey: string;
      let storedFileName: string;

      try {
        storedKey = await storage.saveFile(buffer, fileKey, normalizedType);
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
        // This file's storage write has no matching DB record yet — clean it up
        // before rolling back prior committed files.
        try {
          await storage.deleteFile(storedKey);
        } catch (e) {
          logError(
            'rollback: failed to delete orphaned storage file',
            { storedKey },
            e instanceof Error ? e.message : String(e)
          );
        }
        await rollbackAll();
        throw errorHandler.handleSupabaseError(
          insertError,
          'Save instrument image'
        );
      }

      // Storage + DB are now both committed for this file.
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
        logError(
          'Failed to generate presigned URL:',
          presignError instanceof Error
            ? presignError.message
            : String(presignError)
        );
        signedUrl = inserted.image_url || publicUrl;
      }

      uploads.push({
        ...stripInstrumentScope(
          // DB row lacks alt_text (added by domain type); safe cast since we never read alt_text here
          inserted as unknown as InstrumentImage & { instruments?: unknown }
        ),
        image_url: signedUrl,
      });
    }

    return NextResponse.json({ data: uploads });
  } catch (error) {
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

    logError(
      'Instrument image upload error:',
      error instanceof Error ? error.message : String(error)
    );

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
 * Delete a specific image for an instrument
 */
async function deleteHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  try {
    const storage = getStorage();

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    if (!validateUUID(id)) {
      return createApiErrorResponse(
        { message: 'Invalid instrument ID format' },
        400
      );
    }

    const ownershipError = await ensureOwnedInstrument(auth, id);
    if (ownershipError) return ownershipError;

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
        `imageId=${imageId} instrumentId=${id}`
      );
      return createApiErrorResponse(
        { message: 'Image storage key could not be resolved' },
        409
      );
    }

    // 1) DB record 먼저 삭제
    const { error: deleteError } = await auth.userSupabase
      .from('instrument_images')
      .delete()
      .eq('id', imageId)
      .eq('instrument_id', id)
      .eq('org_id', auth.orgId!);

    if (deleteError) {
      throw errorHandler.handleSupabaseError(
        deleteError,
        'Delete instrument image'
      );
    }

    let storageDeleted = false;

    // 2) storage 삭제는 best-effort이지만 결과는 payload에 반영
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
