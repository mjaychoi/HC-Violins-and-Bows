import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import SalesTable from '../SalesTable';
import { EnrichedSale, Instrument } from '@/types';
import { SaleStatus } from '../../types';

// Mock Next.js Link
jest.mock('next/link', () => {
  const MockLink = ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock formatDisplayDate
jest.mock('@/utils/dateParsing', () => ({
  formatDisplayDate: jest.fn((date: string) => date),
  parseYMDUTC: jest.fn((date: string) => new Date(date)),
}));

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: '',
  note: '',
  client_number: null,
  created_at: '2024-01-01T00:00:00Z',
};

const mockInstrument: Instrument = {
  id: 'instrument-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: '4/4',
  serial_number: 'SN123',
  year: 1700,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: null,
  certificate: true,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
};

const mockSales: EnrichedSale[] = [
  {
    id: 'sale-1',
    client_id: 'client-1',
    instrument_id: 'instrument-1',
    sale_price: 1000,
    sale_date: '2024-01-15',
    notes: 'Test sale',
    created_at: '2024-01-15T00:00:00Z',
    client: mockClient,
    instrument: mockInstrument,
  },
  {
    id: 'sale-2',
    client_id: 'client-1',
    instrument_id: null,
    sale_price: -200,
    sale_date: '2024-01-20',
    notes: null,
    created_at: '2024-01-20T00:00:00Z',
    client: mockClient,
    instrument: undefined,
  },
];

describe('SalesTable', () => {
  const mockOnSort = jest.fn();
  const mockGetSortArrow = jest.fn(() => (
    <span data-testid="sort-arrow">↕</span>
  ));
  const mockOnSendReceipt = jest.fn();
  const mockOnRefund = jest.fn();
  const mockOnUndoRefund = jest.fn();
  const mockStatusForSale = jest.fn((sale: EnrichedSale): SaleStatus => {
    return sale.sale_price < 0 ? 'Refunded' : 'Paid';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when loading', () => {
    const { container } = render(
      <SalesTable
        sales={[]}
        loading={true}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // TableSkeleton renders a table, so check for skeleton animation classes instead
    const skeletonElements = container.querySelectorAll('.animate-pulse');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('renders empty state when no sales', () => {
    render(
      <SalesTable
        sales={[]}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    expect(screen.getByText('No sales yet')).toBeInTheDocument();
  });

  it('renders empty state with filter message when filters are active', () => {
    const mockOnResetFilters = jest.fn();
    render(
      <SalesTable
        sales={[]}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
      />
    );

    expect(
      screen.getByText('No sales found matching your filters')
    ).toBeInTheDocument();
  });

  it('renders sales table with data', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    // John Doe appears in first row
    const johnDoeLinks = screen.getAllByText('John Doe');
    expect(johnDoeLinks.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stradivarius').length).toBeGreaterThan(0);
    expect(screen.getByText('sale-1')).toBeInTheDocument();
  });

  it('calls onSort when column header is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    const dateHeader = screen.getByText('Date').closest('th');
    expect(dateHeader).toBeInTheDocument();
    if (dateHeader) {
      await user.click(dateHeader);
      expect(mockOnSort).toHaveBeenCalledWith('sale_date');
    }
  });

  it('renders sort arrows via getSortArrow', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // getSortArrow should be called for each sortable column
    expect(mockGetSortArrow).toHaveBeenCalledWith('sale_date');
    expect(mockGetSortArrow).toHaveBeenCalledWith('client_name');
    expect(mockGetSortArrow).toHaveBeenCalledWith('sale_price');
  });

  it('calls onSendReceipt when receipt button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    const receiptButtons = screen.getAllByText('Receipt');
    await user.click(receiptButtons[0]);
    expect(mockOnSendReceipt).toHaveBeenCalledWith(mockSales[0]);
  });

  it('disables receipt button when client has no email', () => {
    const saleWithoutEmail: EnrichedSale = {
      ...mockSales[0],
      client: {
        ...mockClient,
        email: '',
      },
    };

    render(
      <SalesTable
        sales={[saleWithoutEmail]}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    const receiptButton = screen.getByText('Receipt').closest('button');
    expect(receiptButton).toBeDisabled();
  });

  it('calls onRefund when refund button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    const refundButton = screen.getByText('Refund');
    await user.click(refundButton);
    expect(mockOnRefund).toHaveBeenCalledWith(mockSales[0]);
  });

  it('shows undo refund button for refunded sales', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // sale-2 is refunded (price < 0)
    const undoRefundButtons = screen.getAllByText('Undo Refund');
    expect(undoRefundButtons.length).toBeGreaterThan(0);
    // sale-1 is paid, so it has refund button, not undo refund
    const refundButtons = screen.getAllByText('Refund');
    // Should have refund button for paid sale and undo refund for refunded sale
    expect(refundButtons.length + undoRefundButtons.length).toBe(
      mockSales.length
    );
  });

  it('calls onUndoRefund when undo refund button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    const undoRefundButton = screen.getByText('Undo Refund');
    await user.click(undoRefundButton);
    expect(mockOnUndoRefund).toHaveBeenCalledWith(mockSales[1]);
  });

  it('displays status badge correctly', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('displays client email when name is missing', () => {
    const saleWithEmailOnly: EnrichedSale = {
      ...mockSales[0],
      client: {
        ...mockClient,
        first_name: '',
        last_name: '',
      },
    };

    render(
      <SalesTable
        sales={[saleWithEmailOnly]}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // Email appears in link and also as secondary text
    const emailElements = screen.getAllByText('john@example.com');
    expect(emailElements.length).toBeGreaterThan(0);
  });

  it('displays dash when client is missing', () => {
    const saleWithoutClient: EnrichedSale = {
      ...mockSales[0],
      client: undefined,
      client_id: null,
    };

    render(
      <SalesTable
        sales={[saleWithoutClient]}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays dash when instrument is missing', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // sale-2 has no instrument
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('formats currency correctly', () => {
    render(
      <SalesTable
        sales={mockSales}
        loading={false}
        onSort={mockOnSort}
        getSortArrow={mockGetSortArrow}
        onSendReceipt={mockOnSendReceipt}
        onRefund={mockOnRefund}
        onUndoRefund={mockOnUndoRefund}
        statusForSale={mockStatusForSale}
      />
    );

    // Currency formatting should show absolute value
    // Multiple cells may contain currency, so use getAllByText
    const currency1000 = screen.getAllByText('$1,000.00');
    const currency200 = screen.getAllByText('$200.00');
    expect(currency1000.length).toBeGreaterThan(0);
    expect(currency200.length).toBeGreaterThan(0);
  });
});
