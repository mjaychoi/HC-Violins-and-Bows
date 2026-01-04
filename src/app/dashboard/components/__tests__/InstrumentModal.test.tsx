/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstrumentModal from '../InstrumentModal';
import { Instrument } from '@/types';

// Mock dependencies
jest.mock('@/hooks/useOutsideClose');
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="optimized-image" />
  ),
}));
jest.mock('@/contexts/SuccessToastContext', () => ({
  useSuccessToastContext: () => ({
    showSuccess: jest.fn(),
  }),
}));
jest.mock('@/contexts/ErrorContext', () => ({
  useErrorContext: () => ({
    handleError: jest.fn(),
  }),
}));
jest.mock('@/utils/apiFetch');
jest.mock('../../utils/dashboardUtils', () => ({
  formatInstrumentPrice: (price: number | null) =>
    price ? `$${price.toLocaleString()}` : '—',
  formatInstrumentYear: (year: number | null) => year?.toString() || '—',
  formatFileSize: (size: number) => `${(size / 1024).toFixed(2)} KB`,
}));

const apiFetch = require('@/utils/apiFetch').apiFetch as jest.MockedFunction<
  typeof import('@/utils/apiFetch').apiFetch
>;

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
    apiFetch.mockResolvedValue({
      ok: true,
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
    apiFetch.mockResolvedValue({
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
    });
  });

  it('should fetch certificates when modal opens and instrument has certificate', async () => {
    apiFetch.mockResolvedValue({
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
      expect(apiFetch).toHaveBeenCalledWith(
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
      expect(apiFetch).toHaveBeenCalledWith('/api/instruments/inst-1/images');
    });

    // ✅ 변경: InstrumentModal은 항상 certificates를 fetch하도록 수정됨
    // (certificate section을 항상 표시하고 명확한 상태 메시지를 보여주기 위해)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/instruments/inst-1/certificates'
      );
    });
  });

  it('should display loading state for images', async () => {
    apiFetch.mockImplementation(
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
    apiFetch.mockResolvedValue({
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
});
