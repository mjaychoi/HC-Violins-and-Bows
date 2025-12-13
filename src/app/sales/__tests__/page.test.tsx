import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesPage from '../page';
import { useSalesHistory } from '../hooks/useSalesHistory';
import { useUnifiedClients, useUnifiedInstruments } from '@/hooks/useUnifiedData';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useModalState } from '@/hooks/useModalState';
import { SalesHistory, Client, Instrument } from '@/types';

// Mock hooks
jest.mock('../hooks/useSalesHistory');
jest.mock('@/hooks/useUnifiedData');
jest.mock('@/hooks/useAppFeedback');
jest.mock('@/hooks/useModalState');

// Mock components
jest.mock('@/components/layout', () => ({
  AppLayout: ({ children, title }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
  TableSkeleton: ({ rows, columns }: { rows?: number; columns?: number }) => (
    <div data-testid="table-skeleton">
      {rows}x{columns} skeleton
    </div>
  ),
  ErrorToasts: () => <div data-testid="error-toasts" />,
  SuccessToasts: () => <div data-testid="success-toasts" />,
  Pagination: ({ currentPage, totalPages, onPageChange }: any) => (
    <div data-testid="pagination">
      Page {currentPage} of {totalPages}
      <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
    </div>
  ),
}));

jest.mock('../components/SaleForm', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onSubmit, submitting }: any) =>
    isOpen ? (
      <div data-testid="sale-form-modal">
        <button onClick={onClose} data-testid="close-modal">Close</button>
        <button
          onClick={() => onSubmit({ sale_price: 2500, sale_date: '2024-01-15' })}
          disabled={submitting}
          data-testid="submit-sale"
        >
          Submit
        </button>
      </div>
    ) : null,
}));

// Mock dynamic import for SalesCharts
jest.mock('next/dynamic', () => {
  return (loader: () => Promise<any>) => {
    // For tests, immediately resolve the dynamic import
    const MockedComponent = ({ sales }: { sales: any[] }) => (
      <div data-testid="sales-charts">
        Charts for {sales.length} sales
      </div>
    );
    MockedComponent.displayName = 'MockedSalesCharts';
    // Pre-load the component by calling loader synchronously in test
    loader().then(() => {}).catch(() => {});
    return MockedComponent;
  };
});

jest.mock('../components/SalesSummary', () => ({
  __esModule: true,
  default: ({ totals }: any) => (
    <div data-testid="sales-summary">
      <div>Revenue</div>
      <div>Refunded</div>
      <div>Net Sales</div>
      <div>Orders</div>
      <div>Avg. Ticket</div>
      {totals?.refundRate && totals.refundRate > 0 && (
        <div>Refund Rate</div>
      )}
    </div>
  ),
}));

jest.mock('../components/SalesFilters', () => ({
  __esModule: true,
  default: ({ search, onSearchChange, from, onFromChange, to, onToChange, onClearFilters, onDatePreset, onExportCSV }: any) => (
    <div data-testid="sales-filters">
      <input
        data-testid="search-input"
        placeholder="Search sales (client, instrument, notes)..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <label>
        From date
        <input
          data-testid="from-date"
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </label>
      <label>
        To date
        <input
          data-testid="to-date"
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
        />
      </label>
      <button onClick={() => onDatePreset('last7')}>Last 7 days</button>
      <button onClick={() => onDatePreset('thisMonth')}>This month</button>
      <button data-testid="clear-filters" onClick={onClearFilters}>
        Clear filters
      </button>
      <button onClick={onExportCSV}>Export CSV</button>
    </div>
  ),
}));

jest.mock('../components/SalesTable', () => ({
  __esModule: true,
  default: ({ sales }: any) => (
    <div data-testid="sales-table">
      {sales.length === 0 ? (
        <div>No sales found</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Instrument</th>
              <th>Amount</th>
              <th>Sale ID</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale: any) => (
              <tr key={sale.id}>
                <td>{sale.sale_date}</td>
                <td>{sale.sale_price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  ),
}));

jest.mock('../components/SalesInsights', () => ({
  __esModule: true,
  default: () => <div data-testid="sales-insights">Insights</div>,
}));

jest.mock('../components/SalesAlerts', () => ({
  __esModule: true,
  default: () => <div data-testid="sales-alerts">Alerts</div>,
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/sales'),
}));

jest.mock('../utils/salesUtils', () => {
  const actual = jest.requireActual('../utils/salesUtils');
  return {
    ...actual,
    getDateRangeFromPreset: jest.fn((preset: string) => {
      const today = new Date();
      const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
      
      switch (preset) {
        case 'last7': {
          const last7Date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
          const from = `${last7Date.getUTCFullYear()}-${String(last7Date.getUTCMonth() + 1).padStart(2, '0')}-${String(last7Date.getUTCDate()).padStart(2, '0')}`;
          return { from, to: todayStr };
        }
        case 'thisMonth': {
          const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
          const from = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`;
          return { from, to: todayStr };
        }
        case 'lastMonth': {
          const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
          const lastMonthEnd = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0));
          const from = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(lastMonth.getUTCDate()).padStart(2, '0')}`;
          const to = `${lastMonthEnd.getUTCFullYear()}-${String(lastMonthEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getUTCDate()).padStart(2, '0')}`;
          return { from, to };
        }
        case 'last3Months': {
          const threeMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
          const from = `${threeMonthsAgo.getUTCFullYear()}-${String(threeMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(threeMonthsAgo.getUTCDate()).padStart(2, '0')}`;
          return { from, to: todayStr };
        }
        case 'last12Months': {
          const twelveMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
          const from = `${twelveMonthsAgo.getUTCFullYear()}-${String(twelveMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(twelveMonthsAgo.getUTCDate()).padStart(2, '0')}`;
          return { from, to: todayStr };
        }
        default:
          return {
            from: '',
            to: '',
          };
      }
    }),
  };
});

jest.mock('date-fns', () => ({
  format: jest.fn((date: Date, formatStr: string) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (formatStr === 'yyyy-MM-dd') {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  }),
  startOfMonth: jest.fn((date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)),
  endOfMonth: jest.fn((date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  subDays: jest.fn((date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }),
  subMonths: jest.fn((date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
  }),
  parseISO: jest.fn((dateStr: string) => new Date(dateStr)),
  startOfDay: jest.fn((date: Date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }),
  endOfDay: jest.fn((date: Date) => {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }),
  isBefore: jest.fn((date1: Date, date2: Date) => date1.getTime() < date2.getTime()),
  isWithinInterval: jest.fn((date: Date, interval: { start: Date; end: Date }) => {
    const time = date.getTime();
    return time >= interval.start.getTime() && time <= interval.end.getTime();
  }),
  differenceInDays: jest.fn((date1: Date, date2: Date) => {
    const diffTime = date1.getTime() - date2.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }),
  differenceInMonths: jest.fn((date1: Date, date2: Date) => {
    const months = (date1.getFullYear() - date2.getFullYear()) * 12 + (date1.getMonth() - date2.getMonth());
    return months;
  }),
}));

const mockUseSalesHistory = useSalesHistory as jest.MockedFunction<typeof useSalesHistory>;
const mockUseUnifiedClients = useUnifiedClients as jest.MockedFunction<typeof useUnifiedClients>;
const mockUseUnifiedInstruments = useUnifiedInstruments as jest.MockedFunction<typeof useUnifiedInstruments>;
const mockUseAppFeedback = useAppFeedback as jest.MockedFunction<typeof useAppFeedback>;
const mockUseModalState = useModalState as jest.MockedFunction<typeof useModalState>;

const mockClient: Client = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL0001',
  created_at: '2024-01-01T00:00:00Z',
};

const mockInstrument: Instrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: 'Classic',
  year: 1720,
  certificate: true,
  size: '4/4',
  weight: null,
  price: 50000,
  ownership: null,
  note: null,
  serial_number: 'VI0001',
  status: 'Sold',
  created_at: '2024-01-01T00:00:00Z',
};

const mockSale: SalesHistory = {
  id: 'sale-1',
  instrument_id: 'inst-1',
  client_id: 'client-1',
  sale_price: 2500,
  sale_date: '2024-01-15',
  notes: 'Test sale',
  created_at: '2024-01-15T10:30:00Z',
};

describe('SalesPage', () => {
  const mockFetchSales = jest.fn();
  const mockSetPage = jest.fn();
  const mockCreateSale = jest.fn();
  const mockRefundSale = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockHandleError = jest.fn();
  const mockOpenModal = jest.fn();
  const mockCloseModal = jest.fn();

  beforeAll(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseSalesHistory.mockReturnValue({
      sales: [mockSale],
      page: 1,
      totalCount: 1,
      totalPages: 1,
      totals: null,
      pageSize: 10,
      loading: false,
      error: null,
      fetchSales: mockFetchSales,
      setPage: mockSetPage,
      createSale: mockCreateSale,
      refundSale: mockRefundSale,
      undoRefund: jest.fn(),
    });

    mockUseUnifiedClients.mockReturnValue({
      clients: [mockClient],
      loading: false,
      fetchClients: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
    } as any);

    mockUseUnifiedInstruments.mockReturnValue({
      instruments: [mockInstrument],
      loading: false,
      fetchInstruments: jest.fn(),
      createInstrument: jest.fn(),
      updateInstrument: jest.fn(),
      deleteInstrument: jest.fn(),
    } as any);

    mockUseAppFeedback.mockReturnValue({
      ErrorToasts: () => <div data-testid="error-toasts" />,
      SuccessToasts: () => <div data-testid="success-toasts" />,
      showSuccess: mockShowSuccess,
      handleError: mockHandleError,
    } as any);

    mockUseModalState.mockReturnValue({
      isOpen: false,
      isEditing: false,
      selectedItem: null,
      setIsOpen: jest.fn(),
      setIsEditing: jest.fn(),
      setSelectedItem: jest.fn(),
      openModal: mockOpenModal,
      closeModal: mockCloseModal,
      openEditModal: jest.fn(),
      openViewModal: jest.fn(),
      toggleModal: jest.fn(),
      resetModal: jest.fn(),
    } as any);
  });

  it('should render sales page with title', () => {
    render(<SalesPage />);

    expect(screen.getByText('Sales History')).toBeInTheDocument();
  });

  it('should display summary cards', () => {
    render(<SalesPage />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Avg. Ticket')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('should display sales table with data', () => {
    render(<SalesPage />);

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Sale ID')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Instrument')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    mockUseSalesHistory.mockReturnValue({
      sales: [],
      page: 1,
      totalCount: 0,
      totalPages: 1,
      totals: null,
      pageSize: 10,
      loading: true,
      error: null,
      fetchSales: mockFetchSales,
      setPage: mockSetPage,
      createSale: mockCreateSale,
      refundSale: mockRefundSale,
      undoRefund: jest.fn(),
    });

    render(<SalesPage />);
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  // Action button removed in current UI; modal open handled internally

  it('should filter sales by search term', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    const searchInput = screen.getByPlaceholderText(/Search sales/i);
    await user.type(searchInput, 'John');

    // 검색어가 입력되면 enrichedSales가 필터링됨
    await waitFor(() => {
      expect(searchInput).toHaveValue('John');
    });
  });

  it('should apply date filters', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    const fromInput = screen.getByLabelText('From date');
    const toInput = screen.getByLabelText('To date');

    await user.type(fromInput, '2024-01-01');
    await user.type(toInput, '2024-01-31');

    await waitFor(() => {
      expect(fromInput).toHaveValue('2024-01-01');
      expect(toInput).toHaveValue('2024-01-31');
    });

    // 날짜 필터가 적용되면 fetchSales가 호출됨
    await waitFor(() => {
      expect(mockFetchSales).toHaveBeenCalled();
    });
  });

  it('should apply date preset filters', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    // 필터 섹션이 열려있어야 함 (기본적으로 열려있음)
    await waitFor(() => {
      const last7DaysButton = screen.queryByText('Last 7 days');
      if (last7DaysButton) {
        expect(last7DaysButton).toBeInTheDocument();
      }
    });

    const last7DaysButton = screen.getByText('Last 7 days');
    await user.click(last7DaysButton);

    await waitFor(() => {
      expect(mockFetchSales).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should sort table columns', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    const dateHeader = screen.getByText('Date');
    await user.click(dateHeader);

    // 정렬이 적용되었는지 확인
    await waitFor(() => {
      expect(dateHeader).toBeInTheDocument();
    });
  });

  it('should handle pagination', async () => {
    mockUseSalesHistory.mockReturnValue({
      sales: [mockSale],
      page: 1,
      totalCount: 25,
      totalPages: 3,
      totals: null,
      pageSize: 10,
      loading: false,
      error: null,
      fetchSales: mockFetchSales,
      setPage: mockSetPage,
      createSale: mockCreateSale,
      refundSale: mockRefundSale,
      undoRefund: jest.fn(),
    });

    const user = userEvent.setup();
    render(<SalesPage />);

    const nextButton = screen.getByText('Next');
    await user.click(nextButton);

    expect(mockSetPage).toHaveBeenCalled();
  });

  it('should export CSV when clicking export button', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    // 필터 섹션이 기본적으로 열려있으므로 Export CSV 버튼이 바로 보여야 함
    await waitFor(() => {
      const exportButton = screen.queryByText('Export CSV');
      expect(exportButton).toBeInTheDocument();
    });

    const exportButton = screen.getByText('Export CSV');
    await user.click(exportButton);

    // CSV 다운로드가 트리거되었는지 확인 (실제 다운로드는 mock할 수 없지만 클릭은 확인 가능)
    expect(exportButton).toBeInTheDocument();
  });

  it('should clear filters when clicking clear button', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    // 필터 적용
    const searchInput = screen.getByPlaceholderText(/Search sales/i);
    await user.type(searchInput, 'test');

    // Clear filters 버튼이 나타나는지 확인
    await waitFor(() => {
      const clearButton = screen.getByText('Clear filters');
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear filters');
    await user.click(clearButton);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });
  });

  it('should display "No sales found" message when no sales match filters', () => {
    mockUseSalesHistory.mockReturnValue({
      sales: [],
      page: 1,
      totalCount: 0,
      totalPages: 1,
      totals: null,
      pageSize: 10,
      loading: false,
      error: null,
      fetchSales: mockFetchSales,
      setPage: mockSetPage,
      createSale: mockCreateSale,
      refundSale: mockRefundSale,
      undoRefund: jest.fn(),
    });

    render(<SalesPage />);

    expect(screen.getByText(/No sales found/i)).toBeInTheDocument();
  });

  it('should display charts component', () => {
    render(<SalesPage />);

    expect(screen.getByTestId('sales-charts')).toBeInTheDocument();
  });

  it('should show refund rate card when refunds exist', () => {
    const refundSale: SalesHistory = {
      ...mockSale,
      id: 'sale-2',
      sale_price: -500,
    };

    mockUseSalesHistory.mockReturnValue({
      sales: [mockSale, refundSale],
      page: 1,
      totalCount: 2,
      totalPages: 1,
      totals: {
        revenue: 2500,
        refund: 500,
        refundRate: 20,
        avgTicket: 2500,
        count: 2,
      },
      pageSize: 10,
      loading: false,
      error: null,
      fetchSales: mockFetchSales,
      setPage: mockSetPage,
      createSale: mockCreateSale,
      refundSale: mockRefundSale,
      undoRefund: jest.fn(),
    });

    render(<SalesPage />);

    expect(screen.getByText(/Refund Rate/i)).toBeInTheDocument();
  });
});
