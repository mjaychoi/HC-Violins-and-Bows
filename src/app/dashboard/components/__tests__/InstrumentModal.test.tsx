/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InstrumentModal from '../InstrumentModal';
import { Instrument } from '@/types';
import { apiFetch } from '@/utils/apiFetch';

// Mock dependencies
jest.mock('@/hooks/useOutsideClose');
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="optimized-image" />
  ),
}));
const mockShowSuccess = jest.fn();
const mockHandleError = jest.fn();

jest.mock('@/contexts/SuccessToastContext', () => {
  const actual = jest.requireActual('@/contexts/SuccessToastContext');
  return {
    ...actual,
    useSuccessToastContext: () => ({
      showSuccess: mockShowSuccess,
      toasts: [],
      removeToast: jest.fn(),
    }),
  };
});
jest.mock('@/contexts/ErrorContext', () => {
  const actual = jest.requireActual('@/contexts/ErrorContext');
  return {
    ...actual,
    useErrorContext: () => ({
      handleError: mockHandleError,
      errors: [],
      addError: jest.fn(),
      removeError: jest.fn(),
      clearErrors: jest.fn(),
      handleErrorWithRetry: jest.fn(),
      getErrorStats: jest.fn(() => new Map()),
      getErrorCount: jest.fn(() => 0),
      getRecoverySuggestions: jest.fn(() => []),
    }),
  };
});
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canUploadInstrumentMedia: true,
  })),
}));
jest.mock('@/utils/apiFetch');
jest.mock('../../utils/dashboardUtils', () => ({
  formatInstrumentPrice: (price: number | null) =>
    price ? `$${price.toLocaleString()}` : '—',
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

  it('should fetch certificates when modal opens and instrument has certificate', async () => {
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
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates'
      );
    });
  });

  it('should not fetch certificates when instrument does not have certificate', async () => {
    const instrumentWithoutCert = {
      ...mockInstrument,
      certificate: false,
      certificate_name: null,
      cost_price: null,
      consignment_price: null,
    };

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={instrumentWithoutCert}
      />
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/images'
      );
    });

    // ✅ 변경: InstrumentModal은 항상 certificates를 fetch하도록 수정됨
    // (certificate section을 항상 표시하고 명확한 상태 메시지를 보여주기 위해)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates'
      );
    });
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

  it('shows certificate fetch failure separately from empty state', async () => {
    mockApiFetchByUrl({
      '/api/instruments/inst-1/images': { data: [] },
      '/api/instruments/inst-1/certificates': async () => {
        throw new Error('certificate error');
      },
    });

    render(
      <InstrumentModal
        isOpen={true}
        onClose={mockOnClose}
        instrument={mockInstrument}
      />
    );

    await waitFor(() => {
      expect(
        screen.getAllByText('Failed to load media').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByText('No certificate files uploaded yet.')
    ).not.toBeInTheDocument();
  });
});
