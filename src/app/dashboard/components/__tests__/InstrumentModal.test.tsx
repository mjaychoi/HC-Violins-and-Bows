/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InstrumentModal from '../InstrumentModal';
import { Instrument } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CERTIFICATE_PDF_TOO_LARGE_ERROR,
  MAX_CERTIFICATE_PDF_SIZE_BYTES,
} from '@/constants/certificateUpload';

// Mock dependencies
jest.mock('@/hooks/useOutsideClose');
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="optimized-image" />
  ),
}));
const mockShowSuccess = jest.fn();
const mockShowWarning = jest.fn();
const mockHandleError = jest.fn();

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: jest.fn(),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canUploadInstrumentMedia: true,
    canViewInstrumentFinancialData: true,
  })),
}));
jest.mock('@/utils/apiFetch');
jest.mock('../../utils/dashboardUtils', () => ({
  formatInstrumentPrice: (price: number | null | undefined) =>
    price === null || price === undefined
      ? '—'
      : `$${Number(price).toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })}`,
  formatInstrumentYear: (year: number | null) => year?.toString() || '—',
  formatFileSize: (size: number) => `${(size / 1024).toFixed(2)} KB`,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

type ApiFetchHandlerValue =
  | Response
  | {
      ok?: boolean;
      status?: number;
      statusText?: string;
      data?: unknown;
      json?: () => Promise<unknown>;
    }
  | (() => Promise<Response>);

function createMockResponse(value: ApiFetchHandlerValue): Response {
  if (value instanceof Response) return value;
  if (typeof value === 'function') {
    throw new Error(
      'Function handler should be invoked before createMockResponse'
    );
  }
  return {
    ok: value.ok ?? true,
    status: value.status ?? 200,
    statusText: value.statusText ?? 'OK',
    json:
      value.json ??
      (async () => ({
        data: value.data ?? [],
      })),
  } as Response;
}

function mockApiFetchByUrl(handlers: Record<string, ApiFetchHandlerValue>) {
  mockApiFetch.mockImplementation(async (url: unknown) => {
    const key = String(url);
    const handler = handlers[key];
    if (!handler) {
      return createMockResponse({ data: [] });
    }
    if (typeof handler === 'function') {
      return handler();
    }
    return createMockResponse(handler);
  });
}

const mockInstrument: Instrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: '4/4',
  serial_number: 'SN123',
  year: 1700,
  ownership: null,
  size: null,
  weight: null,
  note: 'Test note',
  price: 1000000,
  certificate: true,
  certificate_name: null,
  cost_price: null,
  consignment_price: null,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
};

describe('InstrumentModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (usePermissions as jest.Mock).mockReturnValue({
      canUploadInstrumentMedia: true,
      canViewInstrumentFinancialData: true,
    });
    (useAppFeedback as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccess,
      showWarning: mockShowWarning,
      handleError: mockHandleError,
    });
    mockApiFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'application/pdf' : null,
      },
      blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      json: async () => ({ data: [] }),
    } as Response);

    // Mock window.URL
    global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return null when isOpen is false', () => {
    const { container } = render(
      <InstrumentModal
        isOpen={false}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should return null when instrument is null', () => {
    const { container } = render(
      <InstrumentModal isOpen={true} onClose={mockOnClose} instrument={null} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render modal when isOpen and instrument are provided', () => {
    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    expect(screen.getByText('Instrument Details')).toBeInTheDocument();
    expect(screen.getByText('Retail Price')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    const closeButton = screen.getByLabelText('Close modal');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should fetch images when modal opens', async () => {
    const mockImages = [
      {
        id: 'img-1',
        instrument_id: 'inst-1',
        image_url: '/image1.jpg',
        alt_text: 'Image 1',
        display_order: 1,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockImages }),
    } as Response);

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/instruments/inst-1/images');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/images'
      );
    });
  });

  it('fetches and renders certificate upload controls in instrument details', async () => {
    mockApiFetchByUrl({
      '/api/instruments/inst-1/images': { data: [] },
      '/api/instruments/inst-1/certificates': { data: [] },
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/images'
      );
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates'
      );
    });
    expect(screen.getByText(/^Certificates$/)).toBeInTheDocument();
    expect(screen.getByLabelText('Upload certificate PDF')).toBeInTheDocument();
    expect(screen.getByText('PDF only, max 20MB')).toBeInTheDocument();
    expect(
      screen.getByText('No certificate files uploaded yet.')
    ).toBeInTheDocument();
  });

  it('allows an exactly 20 MiB certificate into the upload flow', async () => {
    const file = new File(['%PDF-'], 'boundary.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: MAX_CERTIFICATE_PDF_SIZE_BYTES,
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );
    fireEvent.change(screen.getByLabelText('Upload certificate PDF'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some(([, init]) => init?.method === 'POST')
      ).toBe(true);
    });
  });

  it('rejects an upload over 20 MiB, resets input, and skips the API', async () => {
    const user = userEvent.setup();
    const file = new File(['%PDF-'], 'oversize.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: MAX_CERTIFICATE_PDF_SIZE_BYTES + 1,
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );
    const input = screen.getByLabelText(
      'Upload certificate PDF'
    ) as HTMLInputElement;
    await user.upload(input, file);

    expect(input.value).toBe('');
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: CERTIFICATE_PDF_TOO_LARGE_ERROR }),
      'InstrumentCertificateUpload'
    );
    expect(
      mockApiFetch.mock.calls.some(([, init]) => init?.method === 'POST')
    ).toBe(false);
  });

  it('renders existing certificate metadata with replace and delete controls', async () => {
    mockApiFetchByUrl({
      '/api/instruments/inst-1/images': { data: [] },
      '/api/instruments/inst-1/certificates': {
        data: [
          {
            id: 'cert-1',
            name: 'cert.pdf',
            path: 'instruments/inst-1/certificates/cert.pdf',
            size: 2048,
            createdAt: '2026-05-08T00:00:00Z',
          },
        ],
      },
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    expect(await screen.findByText('cert.pdf')).toBeInTheDocument();
    expect(screen.getByText(/2\.00 KB/)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Replace certificate cert.pdf')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Delete certificate cert.pdf')
    ).toBeInTheDocument();
  });

  it('deletes an existing certificate and refetches metadata', async () => {
    const user = userEvent.setup();
    let certificateFetchCount = 0;
    mockApiFetch.mockImplementation(async (url, init) => {
      const key = String(url);
      if (key === '/api/instruments/inst-1/images') {
        return createMockResponse({ data: [] });
      }
      if (
        key === '/api/instruments/inst-1/certificates' &&
        init?.method !== 'DELETE'
      ) {
        certificateFetchCount += 1;
        return createMockResponse({
          data:
            certificateFetchCount === 1
              ? [
                  {
                    id: 'cert-1',
                    name: 'cert.pdf',
                    path: 'instruments/inst-1/certificates/cert.pdf',
                    size: 2048,
                    createdAt: '2026-05-08T00:00:00Z',
                  },
                ]
              : [],
        });
      }
      if (
        key === '/api/instruments/inst-1/certificates?id=cert-1' &&
        init?.method === 'DELETE'
      ) {
        return createMockResponse({
          data: null,
          json: async () => ({ message: 'Certificate deleted successfully.' }),
        });
      }

      return createMockResponse({ data: [] });
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await user.click(
      await screen.findByLabelText('Delete certificate cert.pdf')
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates?id=cert-1',
        { method: 'DELETE' }
      );
      expect(
        screen.getByText('No certificate files uploaded yet.')
      ).toBeInTheDocument();
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Certificate deleted successfully.'
    );
  });

  it('replaces an existing certificate and refetches metadata', async () => {
    const user = userEvent.setup();
    let certificateFetchCount = 0;
    mockApiFetch.mockImplementation(async (url, init) => {
      const key = String(url);
      if (key === '/api/instruments/inst-1/images') {
        return createMockResponse({ data: [] });
      }
      if (
        key === '/api/instruments/inst-1/certificates' &&
        init?.method !== 'PUT'
      ) {
        certificateFetchCount += 1;
        return createMockResponse({
          data: [
            {
              id: 'cert-1',
              name:
                certificateFetchCount === 1 ? 'old-cert.pdf' : 'new-cert.pdf',
              path:
                certificateFetchCount === 1
                  ? 'instruments/inst-1/certificates/old-cert.pdf'
                  : 'instruments/inst-1/certificates/new-cert.pdf',
              size: certificateFetchCount === 1 ? 1024 : 4096,
              createdAt: '2026-05-08T00:00:00Z',
            },
          ],
        });
      }
      if (
        key === '/api/instruments/inst-1/certificates?file=old-cert.pdf' &&
        init?.method === 'PUT'
      ) {
        return createMockResponse({
          data: null,
          json: async () => ({ message: 'Certificate replaced successfully.' }),
        });
      }

      return createMockResponse({ data: [] });
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await user.click(
      await screen.findByLabelText('Replace certificate old-cert.pdf')
    );
    const replacement = new File(['new'], 'new-cert.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(replacement, 'size', {
      configurable: true,
      value: MAX_CERTIFICATE_PDF_SIZE_BYTES,
    });
    await user.upload(
      screen.getByLabelText('Replace certificate PDF'),
      replacement
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates?file=old-cert.pdf',
        expect.objectContaining({
          method: 'PUT',
          body: expect.any(FormData),
        })
      );
      expect(screen.getByText('new-cert.pdf')).toBeInTheDocument();
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Certificate replaced successfully.'
    );
  });

  it('rejects an oversized replacement before calling the API', async () => {
    const user = userEvent.setup();
    mockApiFetchByUrl({
      '/api/instruments/inst-1/images': { data: [] },
      '/api/instruments/inst-1/certificates': {
        data: [
          {
            id: 'cert-1',
            name: 'old-cert.pdf',
            path: 'instruments/inst-1/certificates/old-cert.pdf',
            size: 1024,
            createdAt: '2026-05-08T00:00:00Z',
          },
        ],
      },
    });
    const replacement = new File(['new'], 'new-cert.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(replacement, 'size', {
      configurable: true,
      value: MAX_CERTIFICATE_PDF_SIZE_BYTES + 1,
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );
    await user.click(
      await screen.findByLabelText('Replace certificate old-cert.pdf')
    );
    const input = screen.getByLabelText(
      'Replace certificate PDF'
    ) as HTMLInputElement;
    await user.upload(input, replacement);

    expect(input.value).toBe('');
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: CERTIFICATE_PDF_TOO_LARGE_ERROR }),
      'InstrumentCertificateReplace'
    );
    expect(
      mockApiFetch.mock.calls.some(([, init]) => init?.method === 'PUT')
    ).toBe(false);
  });

  it('uploads multiple instrument images from details', async () => {
    const user = userEvent.setup();
    const uploadedImages = [
      {
        id: 'img-2',
        instrument_id: 'inst-1',
        image_url: '/image2.jpg',
        alt_text: null,
        display_order: 1,
        created_at: '2024-01-02T00:00:00Z',
      },
      {
        id: 'img-3',
        instrument_id: 'inst-1',
        image_url: '/image3.jpg',
        alt_text: null,
        display_order: 2,
        created_at: '2024-01-03T00:00:00Z',
      },
    ];

    mockApiFetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ data: uploadedImages }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ data: [] }),
      } as Response;
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    const input = screen.getByLabelText('Upload instrument images');
    await user.upload(input, [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.webp', { type: 'image/webp' }),
    ]);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/images',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
    });

    const uploadCall = mockApiFetch.mock.calls.find(
      ([, init]) => init?.method === 'POST'
    );
    const body = uploadCall?.[1]?.body as FormData;
    expect(body.getAll('images')).toHaveLength(2);
    expect(mockShowSuccess).toHaveBeenCalledWith(
      '2 images uploaded successfully.'
    );
  });

  it('should display loading state for images', async () => {
    mockApiFetch.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ data: [] }),
              } as Response),
            100
          )
        )
    );

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    expect(screen.getByText('Loading images...')).toBeInTheDocument();
  });

  it('should display "No images available" when no images', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No images available')).toBeInTheDocument();
    });
  });

  it('shows image fetch failure separately from empty state and retries', async () => {
    const user = userEvent.setup();
    let imageAttempts = 0;

    mockApiFetchByUrl({
      '/api/instruments/inst-1/images': async () => {
        imageAttempts += 1;
        if (imageAttempts === 1) {
          throw new Error('network error');
        }
        return createMockResponse({
          data: [
            {
              id: 'img-1',
              instrument_id: 'inst-1',
              image_url: '/image1.jpg',
              alt_text: 'Image 1',
              display_order: 0,
              created_at: '2024-01-01',
            },
          ],
        });
      },
      '/api/instruments/inst-1/certificates': { data: [] },
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load media')).toBeInTheDocument();
    });
    expect(screen.queryByText('No images available')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('optimized-image')).toBeInTheDocument();
    });
  });

  describe('admin financial detail (V1-001)', () => {
    const financialInstrument: Instrument = {
      ...mockInstrument,
      price: 5000,
      cost_price: 3000,
      consignment_price: 3500,
    };

    function mockMemberPermissions() {
      (usePermissions as jest.Mock).mockReturnValue({
        canUploadInstrumentMedia: false,
        canViewInstrumentFinancialData: false,
      });
    }

    it('M1: admin sees Cost Price and Consignment Price with formatted values', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={financialInstrument}
        />
      );

      expect(screen.getByText('Cost Price')).toBeInTheDocument();
      expect(screen.getByText('$3,000')).toBeInTheDocument();
      expect(screen.getByText('Consignment Price')).toBeInTheDocument();
      expect(screen.getByText('$3,500')).toBeInTheDocument();
      expect(mockApiFetch).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/instruments\?id=/)
      );
    });

    it('M2/M11/M12: member does not see financial labels or values even when the object includes them', () => {
      mockMemberPermissions();

      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={financialInstrument}
        />
      );

      expect(screen.queryByText('Cost Price')).not.toBeInTheDocument();
      expect(screen.queryByText('Consignment Price')).not.toBeInTheDocument();
      expect(screen.queryByText('$3,000')).not.toBeInTheDocument();
      expect(screen.queryByText('$3,500')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin only')).not.toBeInTheDocument();
      expect(screen.queryByText('Restricted')).not.toBeInTheDocument();
    });

    it('M3: unresolved permissions do not flash financial fields', () => {
      (usePermissions as jest.Mock).mockReturnValue({
        permissionsReady: false,
        canUploadInstrumentMedia: false,
        canViewInstrumentFinancialData: false,
      });

      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={financialInstrument}
        />
      );

      expect(screen.queryByText('Cost Price')).not.toBeInTheDocument();
      expect(screen.queryByText('Consignment Price')).not.toBeInTheDocument();
      expect(screen.queryByText('$3,000')).not.toBeInTheDocument();
      expect(screen.queryByText('$3,500')).not.toBeInTheDocument();
    });

    it('M4: admin with null cost_price omits Cost Price instead of $0', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={{ ...financialInstrument, cost_price: null }}
        />
      );

      expect(screen.queryByText('Cost Price')).not.toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      expect(screen.getByText('Consignment Price')).toBeInTheDocument();
      expect(screen.getByText('$3,500')).toBeInTheDocument();
    });

    it('M5: admin with cost_price 0 shows the formatted zero', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={{ ...financialInstrument, cost_price: 0 }}
        />
      );

      expect(screen.getByText('Cost Price')).toBeInTheDocument();
      expect(screen.getByText('$0')).toBeInTheDocument();
    });

    it('M6: admin with null consignment_price omits Consignment Price instead of $0', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={{ ...financialInstrument, consignment_price: null }}
        />
      );

      expect(screen.queryByText('Consignment Price')).not.toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      expect(screen.getByText('Cost Price')).toBeInTheDocument();
      expect(screen.getByText('$3,000')).toBeInTheDocument();
    });

    it('M7: admin with consignment_price 0 shows the formatted zero', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={{ ...financialInstrument, consignment_price: 0 }}
        />
      );

      expect(screen.getByText('Consignment Price')).toBeInTheDocument();
      expect(screen.getByText('$0')).toBeInTheDocument();
    });

    it('M8/M9: retail price and identity fields remain visible', () => {
      render(
        <InstrumentModal
          isOpen={true}
          onClose={mockOnClose}
          instrument={financialInstrument}
        />
      );

      expect(screen.getByText('Retail Price')).toBeInTheDocument();
      expect(screen.getByText('$5,000')).toBeInTheDocument();
      expect(screen.getByText('Serial Number')).toBeInTheDocument();
      expect(screen.getByText('SN123')).toBeInTheDocument();
      expect(screen.getByText('Maker')).toBeInTheDocument();
      expect(screen.getByText('Stradivarius')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText(/Violin/)).toBeInTheDocument();
      expect(screen.getByText('Year')).toBeInTheDocument();
      expect(screen.getByText('1700')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
    });
  });
});
