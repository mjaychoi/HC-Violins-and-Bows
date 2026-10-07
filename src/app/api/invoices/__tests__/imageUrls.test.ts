import { ErrorCodes } from '@/types/errors';
import {
  attachSignedUrlsToInvoiceItems,
  createInvoiceImageSignedUrl,
  INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS,
} from '../imageUrls';

jest.mock('@/utils/logger');

type StorageExistsResult = {
  data: boolean;
  error: { message?: string } | null;
};

type StorageSignedUrlResult = {
  data: { signedUrl?: string | null } | null;
  error: { message?: string } | null;
};

function createSupabaseMock(options?: {
  existsResult?: StorageExistsResult;
  signedUrlResult?: StorageSignedUrlResult;
}) {
  const exists = jest.fn(
    async () => options?.existsResult ?? { data: true, error: null }
  );
  const createSignedUrl = jest.fn(
    async () =>
      options?.signedUrlResult ?? {
        data: { signedUrl: 'https://signed.example.com/invoice-image.png' },
        error: null,
      }
  );

  return {
    storage: {
      from: jest.fn(() => ({
        exists,
        createSignedUrl,
      })),
    },
    exists,
    createSignedUrl,
  };
}

describe('invoice image URL hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a signed URL only after the storage object exists', async () => {
    const supabase = createSupabaseMock();

    const signedUrl = await createInvoiceImageSignedUrl(
      supabase,
      'test-org/invoice-item.png'
    );

    expect(supabase.storage.from).toHaveBeenCalledWith('invoices');
    expect(supabase.exists).toHaveBeenCalledWith('test-org/invoice-item.png');
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(
      'test-org/invoice-item.png',
      INVOICE_IMAGE_SIGNED_URL_TTL_SECONDS
    );
    expect(signedUrl).toBe('https://signed.example.com/invoice-image.png');
  });

  it('omits the signed URL when the optional storage object is missing', async () => {
    const supabase = createSupabaseMock({
      existsResult: { data: false, error: null },
    });

    await expect(
      attachSignedUrlsToInvoiceItems(
        supabase,
        [
          {
            image_url: 'test-org/missing-image.png',
            image_signed_url: null,
          },
        ],
        'test-org'
      )
    ).resolves.toEqual([
      {
        image_url: 'test-org/missing-image.png',
        image_signed_url: null,
      },
    ]);

    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails closed with 403 when the image path belongs to another org', async () => {
    const supabase = createSupabaseMock();

    await expect(
      attachSignedUrlsToInvoiceItems(
        supabase,
        [
          {
            image_url: 'other-org/secret-image.png',
            image_signed_url: null,
          },
        ],
        'test-org'
      )
    ).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
      status: 403,
      context: {
        invoiceImageHydrationReason: 'cross-tenant',
      },
    });

    expect(supabase.exists).not.toHaveBeenCalled();
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails closed with 404 when the image reference cannot be resolved', async () => {
    const supabase = createSupabaseMock();

    await expect(
      attachSignedUrlsToInvoiceItems(supabase, [
        {
          image_url: 'https://example.com/not-managed-by-storage.png',
          image_signed_url: null,
        },
      ])
    ).rejects.toMatchObject({
      code: ErrorCodes.RECORD_NOT_FOUND,
      status: 404,
    });

    expect(supabase.exists).not.toHaveBeenCalled();
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails with 500 when existence verification errors', async () => {
    const supabase = createSupabaseMock({
      existsResult: {
        data: false,
        error: { message: 'storage unavailable' },
      },
    });

    await expect(
      createInvoiceImageSignedUrl(supabase, 'test-org/invoice-item.png')
    ).rejects.toMatchObject({
      code: ErrorCodes.INTERNAL_ERROR,
      status: 500,
    });

    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails with 500 when signed URL generation fails', async () => {
    const supabase = createSupabaseMock({
      signedUrlResult: {
        data: null,
        error: { message: 'signing failed' },
      },
    });

    await expect(
      createInvoiceImageSignedUrl(supabase, 'test-org/invoice-item.png')
    ).rejects.toMatchObject({
      code: ErrorCodes.INTERNAL_ERROR,
      status: 500,
    });
  });
});
