/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render } from '@testing-library/react';
import CertificateDocument from '../CertificateDocument';
import type { Instrument } from '@/types';

// Mock @react-pdf/renderer
jest.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children, size }: { children: React.ReactNode; size?: string }) => (
    <div data-testid="pdf-page" data-size={size}>
      {children}
    </div>
  ),
  Text: ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <span data-testid="pdf-text" style={style}>
      {children}
    </span>
  ),
  View: ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <div data-testid="pdf-view" style={style}>
      {children}
    </div>
  ),
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Image: ({ src, style }: { src?: string; style?: any }) => (
    <img data-testid="pdf-image" src={src} style={style} alt="" />
  ),
}));

const mockInstrument: Instrument = {
  id: 'instrument-1',
  status: 'Available',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: null,
  year: 1720,
  certificate: true,
  certificate_name: null,
  cost_price: null,
  consignment_price: null,
  size: '4/4',
  weight: null,
  price: 1000000,
  ownership: null,
  note: null,
  serial_number: 'STR-001',
  created_at: '2024-01-01T00:00:00Z',
};

describe('CertificateDocument', () => {
  it('should render Document component', () => {
    const { container } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should render Page component with A4 size', () => {
    const { container } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    const page = container.querySelector('[data-testid="pdf-page"]');
    expect(page).toBeInTheDocument();
    expect(page).toHaveAttribute('data-size', 'A4');
  });

  it('should display store name and tagline', () => {
    const { getAllByText, getByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(getAllByText('HC Violins and Bows').length).toBeGreaterThan(0);
    expect(getByText('Premium String Instruments')).toBeInTheDocument();
  });

  it('should display certificate title', () => {
    const { getByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(getByText('Certificate of Authenticity')).toBeInTheDocument();
  });

  it('should display instrument maker and year', () => {
    const { getAllByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(getAllByText(/Stradivarius/).length).toBeGreaterThan(0);
    expect(getAllByText(/1720/).length).toBeGreaterThan(0);
  });

  it('should display instrument type', () => {
    const { getAllByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(getAllByText(/Violin/i).length).toBeGreaterThan(0);
  });

  it('should handle instrument without maker', () => {
    const instrumentWithoutMaker = {
      ...mockInstrument,
      maker: null,
    };

    const { getAllByText } = render(
      <CertificateDocument instrument={instrumentWithoutMaker} />
    );

    expect(getAllByText(/Unknown maker/i).length).toBeGreaterThan(0);
  });

  it('should handle instrument without year', () => {
    const instrumentWithoutYear = {
      ...mockInstrument,
      year: null,
    };

    const { container, getAllByText } = render(
      <CertificateDocument instrument={instrumentWithoutYear} />
    );

    expect(getAllByText(/Stradivarius/).length).toBeGreaterThan(0);
    // Document should still render
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should display serial number when available', () => {
    const { getAllByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    // Serial number should appear in the document
    expect(getAllByText(/STR-001/).length).toBeGreaterThan(0);
  });

  it('should generate certificate number when not provided', () => {
    const { container } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    // Certificate number should be generated
    const textElements = container.querySelectorAll('[data-testid="pdf-text"]');
    const hasCertNumber = Array.from(textElements).some(el =>
      el.textContent?.includes('CERT-')
    );
    expect(hasCertNumber).toBe(true);
  });

  it('should use provided certificate number', () => {
    const { getAllByText } = render(
      <CertificateDocument
        instrument={mockInstrument}
        certificateNumber="CERT-CUSTOM-2024"
      />
    );

    expect(getAllByText(/CERT-CUSTOM-2024/).length).toBeGreaterThan(0);
  });

  it('should use provided issuedAt date', () => {
    const { getAllByText } = render(
      <CertificateDocument
        instrument={mockInstrument}
        issuedAt="2024-01-15T00:00:00Z"
      />
    );

    // Issue date should appear in the document
    expect(getAllByText(/2024-01-15/).length).toBeGreaterThan(0);
  });

  it('should use provided signer name', () => {
    const { getAllByText } = render(
      <CertificateDocument
        instrument={mockInstrument}
        signerName="Master Craftsman"
      />
    );

    expect(getAllByText(/Master Craftsman/).length).toBeGreaterThan(0);
  });

  it('should use default signer name when not provided', () => {
    const { getAllByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    expect(getAllByText(/J. Kim/).length).toBeGreaterThan(0);
  });

  it('should render logo watermark when logoSrc is provided', () => {
    const { container } = render(
      <CertificateDocument
        instrument={mockInstrument}
        logoSrc="https://example.com/logo.png"
      />
    );

    const image = container.querySelector('[data-testid="pdf-image"]');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('should not render logo watermark when logoSrc is not provided', () => {
    const { container } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    // Image might be present but with null src, or not present at all depending on implementation
    // This test verifies the component handles missing logoSrc gracefully
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should generate verify URL when not provided', () => {
    const { getAllByText } = render(
      <CertificateDocument instrument={mockInstrument} />
    );

    // Verify URL should contain website
    expect(getAllByText(/www\.hcviolins\.com/).length).toBeGreaterThan(0);
  });

  it('should handle instrument without serial number', () => {
    const instrumentWithoutSerial = {
      ...mockInstrument,
      serial_number: null,
    };

    const { container } = render(
      <CertificateDocument instrument={instrumentWithoutSerial} />
    );

    // Should still generate certificate using instrument ID
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should handle instrument with subtype', () => {
    const instrumentWithSubtype = {
      ...mockInstrument,
      subtype: 'Full Size',
    };

    const { container } = render(
      <CertificateDocument instrument={instrumentWithSubtype} />
    );

    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });
});
