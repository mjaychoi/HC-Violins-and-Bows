import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@/test-utils/render';
import DashboardContent from '../DashboardContent';
import { Instrument, Client, ClientInstrument } from '@/types';
import * as itemCsvExport from '../../utils/itemCsvExport';

jest.mock('../../utils/itemCsvExport', () => ({
  downloadItemCSV: jest.fn(),
}));

// Mock useDashboardFilters
const mockSetSearchTerm = jest.fn();
const mockSetShowFilters = jest.fn();
const mockHandleFilterChange = jest.fn();
const mockHandlePriceRangeChange = jest.fn();
const mockClearAllFilters = jest.fn();
const mockHandleSort = jest.fn();
const mockGetSortArrow = jest.fn(() => null);
const mockGetActiveFiltersCount = jest.fn(() => 0);
const mockSetDateRange = jest.fn();
const mockSetPage = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowWarning = jest.fn();
const mockHandleError = jest.fn();
let mockCanManageInstruments = true;
let mockTenantIdentity = {
  tenantIdentityKey: 'user-a:org-a:session-a' as string | null,
  isTenantTransitioning: false,
};

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canManageInstruments: mockCanManageInstruments }),
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => mockTenantIdentity,
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    showSuccess: mockShowSuccess,
    showWarning: mockShowWarning,
    handleError: mockHandleError,
  }),
}));

jest.mock('../../hooks', () => ({
  useDashboardFilters: jest.fn(() => ({
    searchTerm: '',
    setSearchTerm: mockSetSearchTerm,
    showFilters: false,
    setShowFilters: mockSetShowFilters,
    filters: {
      status: [],
      maker: [],
      type: [],
      subtype: [],
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' },
      hasClients: [],
    },
    paginatedItems: [],
    handleFilterChange: mockHandleFilterChange,
    handlePriceRangeChange: mockHandlePriceRangeChange,
    clearAllFilters: mockClearAllFilters,
    handleSort: mockHandleSort,
    getSortArrow: mockGetSortArrow,
    getActiveFiltersCount: mockGetActiveFiltersCount,
    dateRange: null,
    setDateRange: mockSetDateRange,
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    pageSize: 20,
    setPage: mockSetPage,
  })),
}));

// Mock ItemList and ItemFilters
jest.mock('../ItemList', () => {
  return function MockItemList({ items, loading }: any) {
    return (
      <div data-testid="item-list">
        {loading ? 'Loading...' : `Items: ${items.length}`}
      </div>
    );
  };
});

jest.mock('../ItemFilters', () => {
  return function MockItemFilters({ showFilters }: any) {
    return showFilters ? <div data-testid="item-filters">Filters</div> : null;
  };
});

// Mock SearchInput
jest.mock('@/components/common', () => ({
  SearchInput: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

describe('DashboardContent', () => {
  const mockInstrument: Instrument = {
    id: 'inst-1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: null,
    serial_number: 'SN123',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: 1500000,
    certificate: false,
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockEnrichedItems = [
    {
      ...mockInstrument,
      clients: [],
    },
  ];

  const mockClients: Client[] = [];
  const mockClientRelationships: ClientInstrument[] = [];
  const mockOnDeleteClick = jest.fn();
  const mockOnUpdateItemInline = jest.fn();
  const mockOnAddClick = jest.fn();
  const defaultProps = {
    enrichedItems: mockEnrichedItems,
    clients: mockClients,
    clientRelationships: mockClientRelationships,
    clientsLoading: false,
    loading: {
      any: false,
      hasAnyLoading: false,
    },
    onDeleteClick: mockOnDeleteClick,
    onUpdateItemInline: mockOnUpdateItemInline,
    onAddClick: mockOnAddClick,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanManageInstruments = true;
    mockTenantIdentity = {
      tenantIdentityKey: 'user-a:org-a:session-a',
      isTenantTransitioning: false,
    };
    (itemCsvExport.downloadItemCSV as jest.Mock).mockReturnValue('items.csv');
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      filteredItems: mockEnrichedItems,
      paginatedItems: mockEnrichedItems,
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: mockGetActiveFiltersCount,
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      pageSize: 20,
      setPage: mockSetPage,
    });
  });

  it('should render search input', () => {
    render(<DashboardContent {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute(
      'placeholder',
      'Search items by maker, type, serial...'
    );
  });

  it('should update search term when typing', () => {
    render(<DashboardContent {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'test search' } });

    expect(mockSetSearchTerm).toHaveBeenCalledWith('test search');
  });

  it('should render the More Filters button', () => {
    render(<DashboardContent {...defaultProps} />);

    expect(screen.getByText('More Filters')).toBeInTheDocument();
  });

  it('should show clear filters button when filters are active', () => {
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: 'test',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      paginatedItems: mockEnrichedItems,
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: jest.fn(() => 1),
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      pageSize: 20,
      setPage: mockSetPage,
    });

    render(<DashboardContent {...defaultProps} />);
    const clearButton = screen.getByText('Clear filters');
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);
    expect(mockClearAllFilters).toHaveBeenCalled();
    expect(mockSetShowFilters).toHaveBeenCalledWith(false);
  });

  it('should toggle filters panel when "More Filters" button is clicked', () => {
    render(<DashboardContent {...defaultProps} />);

    const moreFiltersButton = screen.getByText('More Filters');
    fireEvent.click(moreFiltersButton);

    expect(mockSetShowFilters).toHaveBeenCalledWith(true);
  });

  it('should show filters panel when showFilters is true', () => {
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      showFilters: true,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      paginatedItems: mockEnrichedItems,
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: mockGetActiveFiltersCount,
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      pageSize: 20,
      setPage: mockSetPage,
    });

    render(<DashboardContent {...defaultProps} />);

    expect(screen.getByTestId('item-filters')).toBeInTheDocument();
  });

  it('should display active filters count badge when filters are active', () => {
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      paginatedItems: mockEnrichedItems,
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: jest.fn(() => 3),
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      pageSize: 20,
      setPage: mockSetPage,
    });

    render(<DashboardContent {...defaultProps} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should render ItemList with correct props', () => {
    render(<DashboardContent {...defaultProps} />);

    const itemList = screen.getByTestId('item-list');
    expect(itemList).toBeInTheDocument();
    expect(itemList).toHaveTextContent('Items: 1');
  });

  it('should pass loading state to ItemList', () => {
    render(
      <DashboardContent
        {...defaultProps}
        loading={{ any: true, hasAnyLoading: true }}
      />
    );

    const itemList = screen.getByTestId('item-list');
    expect(itemList).toHaveTextContent('Loading...');
  });

  it('should handle empty items list', () => {
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      paginatedItems: [],
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: mockGetActiveFiltersCount,
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      pageSize: 20,
      setPage: mockSetPage,
    });

    render(<DashboardContent {...defaultProps} />);

    const itemList = screen.getByTestId('item-list');
    expect(itemList).toHaveTextContent('Items: 0');
  });

  it('should handle optional props', () => {
    render(
      <DashboardContent
        {...defaultProps}
        newlyCreatedItemId="inst-1"
        onNewlyCreatedItemShown={jest.fn()}
      />
    );

    expect(screen.getByTestId('item-list')).toBeInTheDocument();
  });

  it('exports all filtered and sorted rows instead of the current page', () => {
    const allMatchingItems = Array.from({ length: 25 }, (_, index) => ({
      ...mockEnrichedItems[0],
      id: `inst-${index}`,
      maker: `Maker ${String(index).padStart(2, '0')}`,
    }));
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: 'Maker',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [],
      },
      filteredItems: allMatchingItems,
      paginatedItems: allMatchingItems.slice(20),
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: mockGetActiveFiltersCount,
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 2,
      totalPages: 2,
      totalCount: 25,
      pageSize: 20,
      setPage: mockSetPage,
    });

    render(<DashboardContent {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(itemCsvExport.downloadItemCSV).toHaveBeenCalledWith(
      allMatchingItems
    );
    expect(mockShowSuccess).toHaveBeenCalledWith('Exported 25 Items to CSV.');
    expect(mockSetPage).not.toHaveBeenCalled();
    expect(mockSetSearchTerm).not.toHaveBeenCalled();
    expect(mockClearAllFilters).not.toHaveBeenCalled();
  });

  it('does not expose Item export to unauthorized users', () => {
    mockCanManageInstruments = false;
    render(<DashboardContent {...defaultProps} />);

    expect(
      screen.queryByRole('button', { name: 'Export CSV' })
    ).not.toBeInTheDocument();
    expect(itemCsvExport.downloadItemCSV).not.toHaveBeenCalled();
  });

  it('disables export for empty results, loading, or tenant transition', () => {
    const { useDashboardFilters } = require('../../hooks');
    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      showFilters: false,
      setShowFilters: mockSetShowFilters,
      filters: {},
      filteredItems: [],
      paginatedItems: [],
      handleFilterChange: mockHandleFilterChange,
      handlePriceRangeChange: mockHandlePriceRangeChange,
      clearAllFilters: mockClearAllFilters,
      handleSort: mockHandleSort,
      getSortArrow: mockGetSortArrow,
      getActiveFiltersCount: mockGetActiveFiltersCount,
      dateRange: null,
      setDateRange: mockSetDateRange,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      pageSize: 20,
      setPage: mockSetPage,
    });
    const { rerender } = render(<DashboardContent {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();

    (useDashboardFilters as jest.Mock).mockReturnValue({
      ...(useDashboardFilters as jest.Mock).mock.results.at(-1)?.value,
      filteredItems: mockEnrichedItems,
      paginatedItems: mockEnrichedItems,
    });
    rerender(
      <DashboardContent
        {...defaultProps}
        loading={{ any: true, hasAnyLoading: true }}
      />
    );
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();

    mockTenantIdentity = {
      tenantIdentityKey: null,
      isTenantTransitioning: true,
    };
    rerender(<DashboardContent {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(itemCsvExport.downloadItemCSV).not.toHaveBeenCalled();
  });

  it('reports a user-visible error when CSV download fails', () => {
    (itemCsvExport.downloadItemCSV as jest.Mock).mockImplementationOnce(() => {
      throw new Error('download failed');
    });
    render(<DashboardContent {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'download failed' }),
      'Export Item CSV'
    );
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('fails closed when the organization-wide Item response was truncated', () => {
    render(<DashboardContent {...defaultProps} itemsTruncated />);

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(
      screen.getByText(
        'Export unavailable: the complete Item set exceeds the dashboard limit.'
      )
    ).toHaveAttribute('role', 'status');
    expect(itemCsvExport.downloadItemCSV).not.toHaveBeenCalled();
  });

  it('shows a loading state instead of an empty list while a deep link resolves', () => {
    render(
      <DashboardContent
        {...defaultProps}
        instrumentDeepLink={{
          status: 'loading',
          onShowAllItems: jest.fn(),
          onRetry: jest.fn(),
        }}
      />
    );

    expect(screen.getByText('Loading item…')).toBeInTheDocument();
    expect(screen.queryByTestId('item-list')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No items found matching your filters')
    ).not.toBeInTheDocument();
  });

  it('shows not-found recovery for an unavailable deep link', () => {
    const onShowAllItems = jest.fn();
    render(
      <DashboardContent
        {...defaultProps}
        instrumentDeepLink={{
          status: 'not_found',
          onShowAllItems,
          onRetry: jest.fn(),
        }}
      />
    );

    expect(
      screen.getByText('Item not found or unavailable.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all items' }));
    expect(onShowAllItems).toHaveBeenCalled();
    expect(screen.queryByTestId('item-list')).not.toBeInTheDocument();
    expect(mockClearAllFilters).not.toHaveBeenCalled();
  });

  it('shows not-found recovery for an invalid instrument deep link', () => {
    render(
      <DashboardContent
        {...defaultProps}
        instrumentDeepLink={{
          status: 'invalid',
          onShowAllItems: jest.fn(),
          onRetry: jest.fn(),
        }}
      />
    );

    expect(
      screen.getByText('Item not found or unavailable.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('item-list')).not.toBeInTheDocument();
  });

  it('shows retryable error UI for a failed deep-link lookup', () => {
    const onRetry = jest.fn();
    render(
      <DashboardContent
        {...defaultProps}
        instrumentDeepLink={{
          status: 'error',
          onShowAllItems: jest.fn(),
          onRetry,
        }}
      />
    );

    expect(screen.getByText("Couldn't load this item")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByTestId('item-list')).not.toBeInTheDocument();
  });
});
