import type { Invoice, InvoiceItem } from '@/types';
import { logWarn } from '@/utils/logger';

export const INVOICE_IMAGE_BUCKET = 'invoices';
export const INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 15;

type UserScopedSupabase = {
  storage: {
    from: (bucket: string) => {
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

function normalizeInvoiceImageReference(value: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!isAbsoluteUrl(value)) return value.trim() || null;
  return extractInvoiceStoragePathFromUrl(value);
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
): Promise<string | null> {
  const { data, error } = await userSupabase.storage
    .from(INVOICE_IMAGE_BUCKET)
    .createSignedUrl(storagePath, INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    logWarn(
      'invoice-image.signed-url.failed',
      `path=${storagePath} message=${error?.message || 'missing signed URL'}`
    );
    return null;
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
        return { ...item, image_signed_url: item.image_url };
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
