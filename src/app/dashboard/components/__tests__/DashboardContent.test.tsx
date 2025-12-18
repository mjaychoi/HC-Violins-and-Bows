import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@/test-utils/render';
import DashboardContent from '../DashboardContent';
import { Instrument, Client, ClientInstrument } from '@/types';

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
  const mockOnSellClick = jest.fn();

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
    onSellClick: mockOnSellClick,
  };

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('should render quick filter buttons', () => {
    render(<DashboardContent {...defaultProps} />);

    expect(screen.getByText('Has Clients')).toBeInTheDocument();
    expect(screen.getByText('No Clients')).toBeInTheDocument();
    expect(screen.getByText('More Filters')).toBeInTheDocument();
  });

  it('should toggle filters when "Has Clients" button is clicked', () => {
    render(<DashboardContent {...defaultProps} />);

    const hasClientsButton = screen.getByText('Has Clients');
    fireEvent.click(hasClientsButton);

    expect(mockHandleFilterChange).toHaveBeenCalledWith('hasClients', true);
  });

  it('should toggle filters when "No Clients" button is clicked', () => {
    render(<DashboardContent {...defaultProps} />);

    const noClientsButton = screen.getByText('No Clients');
    fireEvent.click(noClientsButton);

    expect(mockHandleFilterChange).toHaveBeenCalledWith('hasClients', false);
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

  it('should highlight active filter button when filter is active', () => {
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
        hasClients: [true],
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

    const hasClientsButton = screen.getByText('Has Clients');
    expect(hasClientsButton).toHaveClass('bg-blue-600');
    expect(hasClientsButton).toHaveAttribute('aria-pressed', 'true');
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
        existingSerialNumbers={['SN123', 'SN456']}
        newlyCreatedItemId="inst-1"
        onNewlyCreatedItemShown={jest.fn()}
        onLoadSampleData={jest.fn()}
      />
    );

    expect(screen.getByTestId('item-list')).toBeInTheDocument();
  });
});
