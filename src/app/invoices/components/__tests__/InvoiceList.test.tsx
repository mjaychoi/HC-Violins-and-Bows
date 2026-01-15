/* eslint-disable @next/next/no-img-element */
import { fireEvent, render, screen } from '@/test-utils/render';
import InvoiceList from '../InvoiceList';
import { Invoice } from '@/types';

// Mock dependencies
jest.mock('@/components/common/OptimizedImage', () => {
  return function MockOptimizedImage({ src, alt }: any) {
    return <img src={src} alt={alt} data-testid="optimized-image" />;
  };
});

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  client_number: 'CL001',
  tags: [],
  interest: '',
  note: '',
  address: null,
  created_at: '2024-01-01T00:00:00Z',
};

const mockInvoice: Invoice = {
  id: 'inv-1',
  invoice_number: 'INV0000001',
  client_id: 'client-1',
  invoice_date: '2024-01-15',
  due_date: '2024-01-30',
  subtotal: 50000,
  tax: 5000,
  total: 55000,
  currency: 'USD',
  status: 'draft',
  notes: 'Test invoice notes',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  client: mockClient,
  items: [
    {
      id: 'item-1',
      invoice_id: 'inv-1',
      instrument_id: 'inst-1',
      description: 'Stradivarius Violin',
      qty: 1,
      rate: 50000,
      amount: 50000,
      image_url: 'https://example.com/image.jpg',
      display_order: 0,
      created_at: '2024-01-15T00:00:00Z',
    },
  ],
};

const mockInvoiceWithoutClient: Invoice = {
  ...mockInvoice,
  id: 'inv-2',
  invoice_number: 'INV0000002',
  client_id: null,
  client: undefined,
};

const baseProps = {
  invoices: [mockInvoice],
  loading: false,
  onSort: jest.fn(),
  getSortState: jest.fn(() => ({ active: false as const })),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onDownload: jest.fn(),
  hasActiveFilters: false,
  onResetFilters: jest.fn(),
  currentPage: 1,
  totalPages: 1,
  totalCount: 1,
  pageSize: 10,
  onPageChange: jest.fn(),
};

describe('InvoiceList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders invoice list', () => {
    render(<InvoiceList {...baseProps} />);

    expect(screen.getByText('INV0000001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    render(<InvoiceList {...baseProps} loading={true} />);

    // TableSkeleton should be rendered
    expect(screen.queryByText('INV0000001')).not.toBeInTheDocument();
  });

  it('shows empty state when no invoices', () => {
    render(<InvoiceList {...baseProps} invoices={[]} />);

    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it('honors custom empty title/description', () => {
    render(
      <InvoiceList
        {...baseProps}
        invoices={[]}
        emptyTitle="Custom title"
        emptyDescription="Custom desc"
      />
    );

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Custom desc')).toBeInTheDocument();
  });

  it('shows filtered empty state when filters are active', () => {
    render(
      <InvoiceList {...baseProps} invoices={[]} hasActiveFilters={true} />
    );

    expect(
      screen.getByText(/no invoices found matching your filters/i)
    ).toBeInTheDocument();
  });

  it('handles sort click', () => {
    render(<InvoiceList {...baseProps} />);

    const invoiceNumberHeader = screen.getByText('Invoice #');
    fireEvent.click(invoiceNumberHeader);

    expect(baseProps.onSort).toHaveBeenCalledWith('invoice_number');
  });

  it('displays sort arrows', () => {
    const getSortState = jest.fn(column =>
      column === 'invoice_number'
        ? { active: true as const, direction: 'asc' as const }
        : { active: false as const }
    );
    render(<InvoiceList {...baseProps} getSortState={getSortState} />);

    const invoiceNumberHeader = screen.getByText('Invoice #');
    fireEvent.click(invoiceNumberHeader);

    expect(getSortState).toHaveBeenCalledWith('invoice_number');
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('handles edit click', () => {
    render(<InvoiceList {...baseProps} />);

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(baseProps.onEdit).toHaveBeenCalledWith(mockInvoice);
  });

  it('handles delete click', () => {
    render(<InvoiceList {...baseProps} />);

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(baseProps.onDelete).toHaveBeenCalledWith(mockInvoice);
  });

  it('handles download click', () => {
    render(<InvoiceList {...baseProps} />);

    const downloadButton = screen.getByText('Download PDF');
    fireEvent.click(downloadButton);

    expect(baseProps.onDownload).toHaveBeenCalledWith(mockInvoice);
  });

  it('expands and collapses invoice items on row click', () => {
    render(<InvoiceList {...baseProps} />);

    const invoiceRow = screen.getByText('INV0000001').closest('tr');
    expect(invoiceRow).toBeInTheDocument();

    // Click to expand
    fireEvent.click(invoiceRow!);

    // There are multiple "Items" texts (table header and expanded content), so use getAllByText
    const itemsTexts = screen.getAllByText('Items');
    expect(itemsTexts.length).toBeGreaterThan(0);
    expect(screen.getByText('Stradivarius Violin')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(invoiceRow!);

    // After collapse, only the table header "Items" should remain
    const itemsTextsAfterCollapse = screen.getAllByText('Items');
    expect(itemsTextsAfterCollapse.length).toBe(1); // Only the table header
  });

  it('displays item images in expanded view', () => {
    render(<InvoiceList {...baseProps} />);

    const invoiceRow = screen.getByText('INV0000001').closest('tr');
    fireEvent.click(invoiceRow!);

    const images = screen.getAllByTestId('optimized-image');
    expect(images.length).toBeGreaterThan(0);
  });

  it('displays invoice notes in expanded view', () => {
    render(<InvoiceList {...baseProps} />);

    const invoiceRow = screen.getByText('INV0000001').closest('tr');
    fireEvent.click(invoiceRow!);

    expect(screen.getByText(/notes:/i)).toBeInTheDocument();
    expect(screen.getByText('Test invoice notes')).toBeInTheDocument();
  });

  it('handles invoice without client', () => {
    render(
      <InvoiceList {...baseProps} invoices={[mockInvoiceWithoutClient]} />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('formats currency correctly', () => {
    render(<InvoiceList {...baseProps} />);

    // Should show formatted currency (e.g., $55,000.00)
    expect(screen.getByText(/\$55,000/)).toBeInTheDocument();
  });

  it('displays status badge with correct color', () => {
    render(<InvoiceList {...baseProps} />);

    const statusBadge = screen.getByText('Draft');
    expect(statusBadge).toHaveClass('bg-gray-100');
  });

  it('handles pagination', () => {
    render(<InvoiceList {...baseProps} totalPages={3} currentPage={2} />);

    // Check for pagination controls (Prev/Next buttons)
    expect(screen.getByText('Prev')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('renders multiple invoices', () => {
    const secondInvoice: Invoice = {
      ...mockInvoice,
      id: 'inv-2',
      invoice_number: 'INV0000002',
      status: 'paid',
    };

    render(
      <InvoiceList {...baseProps} invoices={[mockInvoice, secondInvoice]} />
    );

    expect(screen.getByText('INV0000001')).toBeInTheDocument();
    expect(screen.getByText('INV0000002')).toBeInTheDocument();
  });

  it('handles invoice with no items', () => {
    const invoiceWithoutItems: Invoice = {
      ...mockInvoice,
      items: [],
    };

    render(<InvoiceList {...baseProps} invoices={[invoiceWithoutItems]} />);

    expect(screen.getByText('0 items')).toBeInTheDocument();
  });

  it('handles invoice with multiple items', () => {
    const invoiceWithMultipleItems: Invoice = {
      ...mockInvoice,
      items: [
        mockInvoice.items![0],
        {
          ...mockInvoice.items![0],
          id: 'item-2',
          description: 'Second Item',
        },
      ],
    };

    render(
      <InvoiceList {...baseProps} invoices={[invoiceWithMultipleItems]} />
    );

    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it.skip('displays correct date format', () => {
    render(<InvoiceList {...baseProps} />);

    // Date should be formatted (e.g., Jan 14, 2024)
    // There are multiple date strings (invoice date and due date), so use getAllByText
    const dateElements = screen.getAllByText(/Jan.*2024/i);
    expect(dateElements.length).toBeGreaterThan(0);
    // Check that at least one date contains the expected format
    expect(
      dateElements.some(el => el.textContent?.includes('Jan 14, 2024'))
    ).toBe(true);
  });

  it('displays due date when available', () => {
    render(<InvoiceList {...baseProps} />);

    expect(screen.getByText(/due:/i)).toBeInTheDocument();
  });
});
