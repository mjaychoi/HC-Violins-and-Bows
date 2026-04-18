import type { Invoice, InvoiceItem } from '@/types';
import { ErrorCodes } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { logError, logWarn } from '@/utils/logger';

export const INVOICE_IMAGE_BUCKET = 'invoices';
export const INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 15;
export const INVOICE_IMAGE_STORAGE_PATH_SEGMENTS = 2;

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
        const storagePath = pathname.slice(idx + marker.length).trim();
        return storagePath ? decodeURIComponent(storagePath) : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeInvoiceImageReference(
  value: string | null
): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!isAbsoluteUrl(value)) return value.trim() || null;
  return extractInvoiceStoragePathFromUrl(value);
}

export function buildInvoiceImageStoragePath(
  orgId: string,
  fileName: string
): string {
  return `${orgId.trim()}/${fileName.trim()}`;
}

export function getInvoiceImageStoragePathSegmentCount(path: string): number {
  return path
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean).length;
}

export function matchesInvoiceImageStoragePolicyShape(path: string): boolean {
  return (
    getInvoiceImageStoragePathSegmentCount(path) ===
    INVOICE_IMAGE_STORAGE_PATH_SEGMENTS
  );
}

export function extractInvoiceImageStoragePaths(
  items:
    | Array<{
        image_url?: string | null;
      }>
    | undefined
    | null
): string[] {
  if (!items || items.length === 0) return [];

  const paths = items
    .map(item => normalizeInvoiceImageReference(item.image_url ?? null))
    .filter((path): path is string => Boolean(path))
    .filter(matchesInvoiceImageStoragePolicyShape);

  return [...new Set(paths)];
}

export function isInvoiceImageStoragePath(
  value: string | null
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !isAbsoluteUrl(value)
  );
}

export async function createInvoiceImageSignedUrl(
  userSupabase: UserScopedSupabase,
  storagePath: string
): Promise<string> {
  if (!matchesInvoiceImageStoragePolicyShape(storagePath)) {
    logWarn('invoice-image.reference.invalid', 'InvoicesAPI.imageUrls', {
      storagePath,
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
    await storage.exists(storagePath);

  if (existsError) {
    logError(
      'invoice-image.exists.failed',
      existsError,
      'InvoicesAPI.imageUrls',
      { storagePath }
    );
    throw createInvoiceImageReadError(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to verify invoice image availability',
      500,
      storagePath,
      existsError.message || 'Storage existence check failed.'
    );
  }

  if (!exists) {
    logWarn('invoice-image.object.missing', 'InvoicesAPI.imageUrls', {
      storagePath,
    });
    throw createInvoiceImageReadError(
      ErrorCodes.RECORD_NOT_FOUND,
      'Invoice image not found',
      404,
      storagePath,
      'Storage object is missing.'
    );
  }

  const { data, error } = await storage.createSignedUrl(
    storagePath,
    INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS
  );

  if (error || !data?.signedUrl) {
    logError(
      'invoice-image.signed-url.failed',
      error || new Error('Missing signed URL'),
      'InvoicesAPI.imageUrls',
      { storagePath }
    );
    throw createInvoiceImageReadError(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to generate invoice image access URL',
      500,
      storagePath,
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
  items: T[] | undefined
): Promise<T[] | undefined> {
  if (!items || items.length === 0) return items;

  return Promise.all(
    items.map(async item => {
      if (!item.image_url) {
        return { ...item, image_signed_url: null };
      }

      const storagePath = normalizeInvoiceImageReference(item.image_url);
      if (!storagePath) {
        logWarn(
          'invoice-image.reference.unresolvable',
          'InvoicesAPI.imageUrls',
          {
            imageUrl: item.image_url,
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
        storagePath
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
  invoice: Invoice
): Promise<Invoice> {
  const items = await attachSignedUrlsToInvoiceItems(
    userSupabase,
    invoice.items
  );
  return {
    ...invoice,
    items,
  };
}
