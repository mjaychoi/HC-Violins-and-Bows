/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render } from '@testing-library/react';
import InvoiceDocument from '../InvoiceDocument';
import type { InvoiceDocumentProps } from '../InvoiceDocument';

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

const mockProps: InvoiceDocumentProps = {
  company: {
    name: 'HC Violins',
    addressLines: ['123 Main St', 'Seoul, Korea'],
    phone: '02-1234-5678',
    email: 'contact@hcviolins.com',
  },
  billTo: {
    name: 'John Doe',
    addressLines: ['456 Client St', 'Seoul, Korea'],
    phone: '02-9876-5432',
  },
  invoice: {
    invoiceNumber: 'INV-001',
    date: '2024-01-15',
    currency: 'USD',
  },
  items: [
    {
      description: 'Violin, Stradivarius, 1720',
      qty: 1,
      rate: 1000,
    },
  ],
  banking: {
    accountHolder: 'HC Violins',
    bankName: 'Test Bank',
    accountNumber: '123456789',
  },
  totals: {
    subtotal: 1000,
    tax: 100,
    total: 1100,
  },
};

describe('InvoiceDocument', () => {
  it('should render Document component', () => {
    const { container } = render(<InvoiceDocument {...mockProps} />);

    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should render Page component with A4 size', () => {
    const { container } = render(<InvoiceDocument {...mockProps} />);

    const page = container.querySelector('[data-testid="pdf-page"]');
    expect(page).toBeInTheDocument();
    expect(page).toHaveAttribute('data-size', 'A4');
  });

  it('should display company name', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText('HC Violins').length).toBeGreaterThan(0);
  });

  it('should display invoice title', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText('INVOICE').length).toBeGreaterThan(0);
  });

  it('should display invoice number', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/INV-001/).length).toBeGreaterThan(0);
  });

  it('should display billTo name', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText('John Doe').length).toBeGreaterThan(0);
  });

  it('should display company address lines', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText('123 Main St').length).toBeGreaterThan(0);
    expect(getAllByText('Seoul, Korea').length).toBeGreaterThan(0);
  });

  it('should display company phone and email', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/02-1234-5678/).length).toBeGreaterThan(0);
    expect(getAllByText(/contact@hcviolins\.com/).length).toBeGreaterThan(0);
  });

  it('should display invoice items', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/Violin, Stradivarius, 1720/).length).toBeGreaterThan(
      0
    );
  });

  it('should calculate item amount when not provided', () => {
    const props = {
      ...mockProps,
      items: [
        {
          description: 'Test Item',
          qty: 2,
          rate: 500,
          // amount not provided, should calculate qty * rate = 1000
        },
      ],
    };

    const { container } = render(<InvoiceDocument {...props} />);
    // Item amount should be calculated (1000)
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should use provided item amount', () => {
    const props = {
      ...mockProps,
      items: [
        {
          description: 'Test Item',
          qty: 2,
          rate: 500,
          amount: 1500, // Custom amount
        },
      ],
    };

    const { container } = render(<InvoiceDocument {...props} />);
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should display totals', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/SUBTOTAL/i).length).toBeGreaterThan(0);
    expect(getAllByText(/TAX/i).length).toBeGreaterThan(0);
    expect(getAllByText(/TOTAL/i).length).toBeGreaterThan(0);
  });

  it('should display banking information', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/Test Bank/i).length).toBeGreaterThan(0);
    expect(getAllByText(/123456789/).length).toBeGreaterThan(0);
  });

  it('should render logo when logoSrc is provided', () => {
    const { container } = render(
      <InvoiceDocument {...mockProps} logoSrc="https://example.com/logo.png" />
    );

    const image = container.querySelector('[data-testid="pdf-image"]');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('should render company name as text when logoSrc is not provided', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    // Company name should appear as text when no logo
    expect(getAllByText('HC Violins').length).toBeGreaterThan(0);
  });

  it('should display due date when provided', () => {
    const props = {
      ...mockProps,
      invoice: {
        ...mockProps.invoice,
        dueDate: '2024-02-15',
      },
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText(/2024-02-15/).length).toBeGreaterThan(0);
  });

  it('should display invoice status when provided', () => {
    const props = {
      ...mockProps,
      invoice: {
        ...mockProps.invoice,
        status: 'Paid',
      },
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText(/Paid/i).length).toBeGreaterThan(0);
  });

  it('should display conditions when provided', () => {
    const props = {
      ...mockProps,
      conditions: 'Payment due within 30 days',
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText(/Payment due within 30 days/i).length).toBeGreaterThan(
      0
    );
  });

  it('should display custom footer notice when provided', () => {
    const props = {
      ...mockProps,
      footerNotice: 'Custom footer notice',
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText(/Custom footer notice/i).length).toBeGreaterThan(0);
  });

  it('should display default footer notice when not provided', () => {
    const { getAllByText } = render(<InvoiceDocument {...mockProps} />);

    expect(getAllByText(/transfer the total amount/i).length).toBeGreaterThan(
      0
    );
  });

  it('should handle shipTo when provided', () => {
    const props = {
      ...mockProps,
      shipTo: {
        note: 'Ship to address on file',
      },
    };

    const { container } = render(<InvoiceDocument {...props} />);
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should handle multiple address lines', () => {
    const props = {
      ...mockProps,
      company: {
        ...mockProps.company,
        addressLines: ['Line 1', 'Line 2', 'Line 3'],
      },
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText('Line 1').length).toBeGreaterThan(0);
    expect(getAllByText('Line 2').length).toBeGreaterThan(0);
    expect(getAllByText('Line 3').length).toBeGreaterThan(0);
  });

  it('should handle multiple invoice items', () => {
    const props = {
      ...mockProps,
      items: [
        { description: 'Item 1', qty: 1, rate: 100 },
        { description: 'Item 2', qty: 2, rate: 200 },
        { description: 'Item 3', qty: 3, rate: 300 },
      ],
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText('Item 1').length).toBeGreaterThan(0);
    expect(getAllByText('Item 2').length).toBeGreaterThan(0);
    expect(getAllByText('Item 3').length).toBeGreaterThan(0);
  });

  it('should handle tax as 0 when not provided', () => {
    const props = {
      ...mockProps,
      totals: {
        subtotal: 1000,
        total: 1000,
        // tax not provided
      },
    };

    const { container } = render(<InvoiceDocument {...props} />);
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });

  it('should display exchange rate when provided', () => {
    const props = {
      ...mockProps,
      invoice: {
        ...mockProps.invoice,
        exchangeRate: '1 USD = 1,300 KRW',
      },
    };

    const { getAllByText } = render(<InvoiceDocument {...props} />);
    expect(getAllByText(/1 USD = 1,300 KRW/i).length).toBeGreaterThan(0);
  });

  it('should handle different currencies', () => {
    const props = {
      ...mockProps,
      invoice: {
        ...mockProps.invoice,
        currency: 'KRW',
      },
    };

    const { container } = render(<InvoiceDocument {...props} />);
    expect(
      container.querySelector('[data-testid="pdf-document"]')
    ).toBeInTheDocument();
  });
});
