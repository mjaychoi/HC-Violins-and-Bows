import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity, ErrorCodes } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import {
  buildInvoiceImageStoragePath,
  createInvoiceImageSignedUrl,
  INVOICE_IMAGE_BUCKET,
} from '../imageUrls';
import { recordInvoiceImageUpload } from '../imageUploadTracking';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_MULTIPART_BODY_SIZE = 12 * 1024 * 1024; // file + multipart overhead
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function nowMs(): number {
  return typeof globalThis.performance !== 'undefined'
    ? globalThis.performance.now()
    : Date.now();
}

function getContentLength(request: NextRequest): number | null {
  const raw = request.headers?.get('content-length');
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function rejectOversizedMultipartRequest(
  request: NextRequest
): NextResponse | null {
  const contentLength = getContentLength(request);

  if (contentLength && contentLength > MAX_MULTIPART_BODY_SIZE) {
    return createApiErrorResponse(
      {
        message: `Request body must be less than ${Math.round(
          MAX_MULTIPART_BODY_SIZE / 1024 / 1024
        )}MB`,
      },
      413
    );
  }

  return null;
}

const isValidImageSignature = (buffer: Buffer, mimeType: string): boolean => {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  return false;
};

const detectMimeTypeFromSignature = (buffer: Buffer): string | null => {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
};

function resolveImageMimeType(file: File, buffer: Buffer): string | null {
  const rawType = (file.type || '').toLowerCase();
  const normalizedType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;

  const baseName = file.name || '';
  const extension = baseName.includes('.')
    ? baseName.split('.').pop()?.toLowerCase()
    : '';

  const extensionType = extension ? EXTENSION_TO_MIME[extension] : undefined;
  const signatureType = detectMimeTypeFromSignature(buffer);

  const resolvedType = ALLOWED_MIME_TYPES[normalizedType]
    ? normalizedType
    : extensionType && ALLOWED_MIME_TYPES[extensionType]
      ? extensionType
      : signatureType && ALLOWED_MIME_TYPES[signatureType]
        ? signatureType
        : null;

  if (!resolvedType) return null;

  if (!isValidImageSignature(buffer, resolvedType)) {
    return null;
  }

  return resolvedType;
}

function isSupabaseLikeError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (((error as { code?: string }).code ?? '').startsWith('PGRST') ||
      (error as { name?: string }).name === 'PostgrestError' ||
      typeof (error as { code?: unknown }).code === 'string')
  );
}

/**
 * POST /api/invoices/images
 * Upload an image for invoice item to Supabase Storage.
 */
async function postHandler(request: NextRequest, auth: AuthContext) {
  const startTime = nowMs();

  try {
    const orgContextError = requireOrgContext(auth);
    if (orgContextError) return orgContextError;

    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    const oversizedRequest = rejectOversizedMultipartRequest(request);
    if (oversizedRequest) return oversizedRequest;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiErrorResponse(
        { message: 'Invalid multipart form data' },
        400
      );
    }

    const file = formData.get('file');

    if (!(file instanceof File)) {
      return createApiErrorResponse({ message: 'No file provided' }, 400);
    }

    if (file.size <= 0) {
      return createApiErrorResponse({ message: 'Image file is empty' }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        {
          message: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length <= 0) {
      return createApiErrorResponse({ message: 'Image file is empty' }, 400);
    }

    if (buffer.length > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        {
          message: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const resolvedType = resolveImageMimeType(file, buffer);

    if (!resolvedType) {
      return createApiErrorResponse(
        { message: 'Invalid or unsupported image file content' },
        400
      );
    }

    const fileExt = ALLOWED_MIME_TYPES[resolvedType];

    const timestamp = Date.now();
    const fileId = randomUUID();
    const fileName = `invoice-item-${timestamp}-${fileId}.${fileExt}`;
    const filePath = buildInvoiceImageStoragePath(auth.orgId!, fileName);

    const { error: uploadError } = await auth.userSupabase.storage
      .from(INVOICE_IMAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: resolvedType,
        upsert: false,
      });

    if (uploadError) {
      throw errorHandler.handleSupabaseError(
        uploadError,
        'Upload invoice item image'
      );
    }

    const { error: trackingError } = await recordInvoiceImageUpload(
      auth.userSupabase,
      auth.orgId!,
      auth.user.id,
      filePath
    );

    if (trackingError) {
      await auth.userSupabase.storage
        .from(INVOICE_IMAGE_BUCKET)
        .remove([filePath]);

      throw errorHandler.handleSupabaseError(
        trackingError,
        'Record invoice image upload'
      );
    }

    const signedUrl = await createInvoiceImageSignedUrl(
      auth.userSupabase,
      filePath
    );

    if (!signedUrl) {
      await auth.userSupabase.storage
        .from(INVOICE_IMAGE_BUCKET)
        .remove([filePath]);

      throw new Error('Failed to create signed URL for uploaded image');
    }

    const duration = Math.round(nowMs() - startTime);

    logApiRequest(
      'POST',
      '/api/invoices/images',
      200,
      duration,
      'InvoicesAPI',
      {
        fileName,
        fileSize: file.size,
        contentType: resolvedType,
        idempotencyKeyPresent: Boolean(
          request.headers?.get('Idempotency-Key')?.trim()
        ),
      }
    );

    return NextResponse.json({
      success: true,
      filePath,
      signedUrl,
      message: 'Image uploaded successfully',
      metadata: {
        idempotencyKeyPresent: Boolean(
          request.headers?.get('Idempotency-Key')?.trim()
        ),
      },
    });
  } catch (error) {
    const duration = Math.round(nowMs() - startTime);

    const appError = isSupabaseLikeError(error)
      ? errorHandler.handleSupabaseError(error, 'Upload invoice item image')
      : {
          code: ErrorCodes.UNKNOWN_ERROR,
          message: 'Invoice image upload failed',
          details:
            error instanceof Error ? error.message : 'Failed to upload image',
          timestamp: new Date().toISOString(),
        };

    const logInfo = createLogErrorInfo(appError);

    logApiRequest(
      'POST',
      '/api/invoices/images',
      500,
      duration,
      'InvoicesAPI',
      {
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      }
    );

    captureException(
      appError,
      'InvoicesAPI.POST.images',
      { duration },
      ErrorSeverity.MEDIUM
    );

    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const POST = withSentryRoute(withAuthRoute(postHandler));
