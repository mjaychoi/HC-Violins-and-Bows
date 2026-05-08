import type { Invoice, InvoiceItem } from '@/types';
import { ErrorCodes } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { logError, logWarn } from '@/utils/logger';

export const INVOICE_IMAGE_BUCKET = 'invoices';
export const INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 15;
export const INVOICE_IMAGE_STORAGE_PATH_SEGMENTS = 2;

const MAX_STORAGE_PATH_LENGTH = 1_024;
const MAX_STORAGE_SEGMENT_LENGTH = 255;

const ALLOWED_INVOICE_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
]);

type UserScopedSupabase = {
  storage: {
    from: (bucket: string) => {
      exists: (path: string) => Promise<{
        data: boolean;
        error: { message?: string } | null;
      }>;
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => Promise<{
        data: { signedUrl?: string | null } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

function createInvoiceImageReadError(
  code: ErrorCodes,
  message: string,
  status: number,
  storagePath: string,
  details?: string
) {
  return {
    ...errorHandler.createApiError(code, message, status, undefined, details),
    context: {
      invoiceImageHydration: true,
      storagePath,
    },
  };
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeStorageSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, MAX_STORAGE_SEGMENT_LENGTH);
}

function sanitizeInvoiceImageFileName(fileName: string): string {
  const sanitized = sanitizeStorageSegment(fileName);
  return sanitized || 'invoice-image';
}

function getPathSegments(path: string): string[] {
  return path
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
}

function hasAllowedImageExtension(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_INVOICE_IMAGE_EXTENSIONS.has(extension);
}

function normalizeStoragePathCandidate(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.length > MAX_STORAGE_PATH_LENGTH) return null;
  if (trimmed.includes('\0')) return null;
  if (trimmed.includes('\\')) return null;
  if (trimmed.startsWith('/')) return null;
  if (trimmed.includes('..')) return null;
  if (/[\x00-\x1F]/.test(trimmed)) return null;

  const segments = getPathSegments(trimmed);
  if (segments.length !== INVOICE_IMAGE_STORAGE_PATH_SEGMENTS) return null;

  const [orgSegment, fileSegment] = segments;
  if (!orgSegment || !fileSegment) return null;
  if (orgSegment.length > MAX_STORAGE_SEGMENT_LENGTH) return null;
  if (fileSegment.length > MAX_STORAGE_SEGMENT_LENGTH) return null;
  if (!hasAllowedImageExtension(fileSegment)) return null;

  const normalizedOrg = sanitizeStorageSegment(orgSegment);
  const normalizedFile = sanitizeStorageSegment(fileSegment);

  if (normalizedOrg !== orgSegment || normalizedFile !== fileSegment) {
    return null;
  }

  return `${normalizedOrg}/${normalizedFile}`;
}

function extractInvoiceStoragePathFromUrl(value: string): string | null {
  try {
    const { pathname } = new URL(value);
    const markers = [
      '/storage/v1/object/public/invoices/',
      '/storage/v1/object/sign/invoices/',
      '/storage/v1/object/authenticated/invoices/',
      '/object/public/invoices/',
      '/object/sign/invoices/',
      '/object/authenticated/invoices/',
    ];

    for (const marker of markers) {
      const idx = pathname.indexOf(marker);

      if (idx >= 0) {
        const rawStoragePath = pathname.slice(idx + marker.length).trim();
        const decoded = rawStoragePath
          ? decodeURIComponent(rawStoragePath)
          : '';

        return normalizeStoragePathCandidate(decoded);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function matchesExpectedOrgPrefix(
  storagePath: string,
  expectedOrgId?: string | null
): boolean {
  if (!expectedOrgId?.trim()) return true;

  const [orgSegment] = getPathSegments(storagePath);
  return orgSegment === expectedOrgId.trim();
}

export function normalizeInvoiceImageReference(
  value: string | null,
  expectedOrgId?: string | null
): string | null {
  if (!value || typeof value !== 'string') return null;

  const storagePath = isAbsoluteUrl(value)
    ? extractInvoiceStoragePathFromUrl(value)
    : normalizeStoragePathCandidate(value);

  if (!storagePath) return null;

  if (!matchesExpectedOrgPrefix(storagePath, expectedOrgId)) {
    return null;
  }

  return storagePath;
}

export function buildInvoiceImageStoragePath(
  orgId: string,
  fileName: string
): string {
  const safeOrgId = sanitizeStorageSegment(orgId);
  const safeFileName = sanitizeInvoiceImageFileName(fileName);

  if (!safeOrgId || !safeFileName) {
    throw new Error('Invalid invoice image storage path input');
  }

  const storagePath = `${safeOrgId}/${safeFileName}`;

  if (!matchesInvoiceImageStoragePolicyShape(storagePath, safeOrgId)) {
    throw new Error('Generated invoice image storage path is invalid');
  }

  return storagePath;
}

export function getInvoiceImageStoragePathSegmentCount(path: string): number {
  return getPathSegments(path).length;
}

export function matchesInvoiceImageStoragePolicyShape(
  path: string,
  expectedOrgId?: string | null
): boolean {
  const normalizedPath = normalizeStoragePathCandidate(path);

  if (!normalizedPath) return false;

  return matchesExpectedOrgPrefix(normalizedPath, expectedOrgId);
}

export function extractInvoiceImageStoragePaths(
  items:
    | Array<{
        image_url?: string | null;
      }>
    | undefined
    | null,
  expectedOrgId?: string | null
): string[] {
  if (!items || items.length === 0) return [];

  const paths = items
    .map(item =>
      normalizeInvoiceImageReference(item.image_url ?? null, expectedOrgId)
    )
    .filter((path): path is string => Boolean(path));

  return [...new Set(paths)];
}

export function isInvoiceImageStoragePath(
  value: string | null,
  expectedOrgId?: string | null
): value is string {
  if (typeof value !== 'string') return false;

  return Boolean(normalizeInvoiceImageReference(value, expectedOrgId));
}

export async function createInvoiceImageSignedUrl(
  userSupabase: UserScopedSupabase,
  storagePath: string,
  expectedOrgId?: string | null
): Promise<string> {
  const normalizedPath = normalizeInvoiceImageReference(
    storagePath,
    expectedOrgId
  );

  if (!normalizedPath) {
    logWarn('invoice-image.reference.invalid', 'InvoicesAPI.imageUrls', {
      storagePath,
      expectedOrgId,
    });

    throw createInvoiceImageReadError(
      ErrorCodes.RECORD_NOT_FOUND,
      'Invoice image not found',
      404,
      storagePath,
      'Storage path does not match invoice image policy.'
    );
  }

  const storage = userSupabase.storage.from(INVOICE_IMAGE_BUCKET);

  const { data: exists, error: existsError } =
    await storage.exists(normalizedPath);

  if (existsError) {
    logError(
      'invoice-image.exists.failed',
      existsError,
      'InvoicesAPI.imageUrls',
      { storagePath: normalizedPath }
    );

    throw createInvoiceImageReadError(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to verify invoice image availability',
      500,
      normalizedPath,
      existsError.message || 'Storage existence check failed.'
    );
  }

  if (!exists) {
    logWarn('invoice-image.object.missing', 'InvoicesAPI.imageUrls', {
      storagePath: normalizedPath,
    });

    throw createInvoiceImageReadError(
      ErrorCodes.RECORD_NOT_FOUND,
      'Invoice image not found',
      404,
      normalizedPath,
      'Storage object is missing.'
    );
  }

  const { data, error } = await storage.createSignedUrl(
    normalizedPath,
    INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS
  );

  if (error || !data?.signedUrl) {
    logError(
      'invoice-image.signed-url.failed',
      error || new Error('Missing signed URL'),
      'InvoicesAPI.imageUrls',
      { storagePath: normalizedPath }
    );

    throw createInvoiceImageReadError(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to generate invoice image access URL',
      500,
      normalizedPath,
      error?.message || 'Missing signed URL.'
    );
  }

  return data.signedUrl;
}

export async function attachSignedUrlsToInvoiceItems<
  T extends Pick<InvoiceItem, 'image_url'> & {
    image_signed_url?: string | null;
  },
>(
  userSupabase: UserScopedSupabase,
  items: T[] | undefined,
  expectedOrgId?: string | null
): Promise<T[] | undefined> {
  if (!items || items.length === 0) return items;

  return Promise.all(
    items.map(async item => {
      if (!item.image_url) {
        return { ...item, image_signed_url: null };
      }

      const storagePath = normalizeInvoiceImageReference(
        item.image_url,
        expectedOrgId
      );

      if (!storagePath) {
        logWarn(
          'invoice-image.reference.unresolvable',
          'InvoicesAPI.imageUrls',
          {
            imageUrl: item.image_url,
            expectedOrgId,
          }
        );

        throw createInvoiceImageReadError(
          ErrorCodes.RECORD_NOT_FOUND,
          'Invoice image not found',
          404,
          item.image_url,
          'Image reference could not be resolved to storage.'
        );
      }

      const signedUrl = await createInvoiceImageSignedUrl(
        userSupabase,
        storagePath,
        expectedOrgId
      );

      return {
        ...item,
        image_signed_url: signedUrl,
      };
    })
  );
}

export async function attachSignedUrlsToInvoice(
  userSupabase: UserScopedSupabase,
  invoice: Invoice,
  expectedOrgId?: string | null
): Promise<Invoice> {
  const items = await attachSignedUrlsToInvoiceItems(
    userSupabase,
    invoice.items,
    expectedOrgId
  );

  return {
    ...invoice,
    items,
  };
}
