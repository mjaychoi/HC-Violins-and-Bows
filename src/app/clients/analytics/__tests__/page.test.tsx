import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomerPage from '../page';

const mockSetSearchTerm = jest.fn();
const mockSetTagFilter = jest.fn();
const mockSetSortBy = jest.fn();
const mockSetSelectedCustomerId = jest.fn();
const mockCustomers = [
  { id: 'c1', first_name: 'Jane', last_name: 'Kim', purchases: [] },
  { id: 'c2', first_name: 'Minho', last_name: 'Lee', purchases: [] },
];
jest.mock('../hooks/useCustomers', () => ({
  useCustomers: () => ({
    customers: mockCustomers,
    rawCustomers: mockCustomers,
    searchTerm: '',
    setSearchTerm: mockSetSearchTerm,
    tagFilter: null,
    setTagFilter: mockSetTagFilter,
    sortBy: 'name',
    setSortBy: mockSetSortBy,
    selectedCustomerId: 'c1',
    setSelectedCustomerId: mockSetSelectedCustomerId,
    selectedCustomer: mockCustomers[0],
    availableTags: ['VIP', 'Musician'],
  }),
}));

// FIXED: CustomerSearch component is now used (replaced duplicated UI in page.tsx)
jest.mock('../components/CustomerSearch', () => ({
  CustomerSearch: ({ searchTerm, onSearchChange, tagFilter, onTagFilterChange, sortBy, onSortChange, availableTags }: any) => {
    return (
      <div data-testid="customer-search">
        <input
          data-testid="search-input"
          placeholder="Search customers by name, email, or tag..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
        />
        <button
          data-testid="tag-filter-all"
          onClick={() => onTagFilterChange(null)}
          className={tagFilter === null ? 'selected' : ''}
        >
          All
        </button>
        {availableTags.map((tag: string) => (
          <button
            key={tag}
            data-testid={`tag-filter-${tag}`}
            onClick={() => onTagFilterChange(tagFilter === tag ? null : tag)}
            className={tagFilter === tag ? 'selected' : ''}
          >
            {tag}
          </button>
        ))}
        <select
          data-testid="sort-select"
          value={sortBy}
          onChange={e => onSortChange(e.target.value)}
        >
          <option value="name">Name</option>
          <option value="spend">Total spend</option>
          <option value="recent">Recent activity</option>
        </select>
      </div>
    );
  },
}));

const mockListProps: any[] = [];
jest.mock('../components/CustomerList', () => ({
  CustomerList: (props: any) => {
    mockListProps.push(props);
    return (
      <button
        data-testid="customer-list"
        onClick={() => props.onSelect && props.onSelect('c2')}
      >
        List
      </button>
    );
  },
}));

const mockDetailProps: any[] = [];
jest.mock('../components/CustomerDetail', () => ({
  CustomerDetail: (props: any) => {
    mockDetailProps.push(props);
    return <div data-testid="customer-detail">Detail</div>;
  },
}));

const mockHistoryProps: any[] = [];
jest.mock('../components/PurchaseHistory', () => ({
  PurchaseHistory: (props: any) => {
    mockHistoryProps.push(props);
    return (
      <button
        data-testid="purchase-history"
        onClick={() =>
          props.onStatusFilterChange && props.onStatusFilterChange('Completed')
        }
      >
        History
      </button>
    );
  },
}));

const mockStatsProps: any[] = [];
jest.mock('../components/CustomerStats', () => ({
  CustomerStats: (props: any) => {
    mockStatsProps.push(props);
    return <div data-testid="customer-stats">Stats</div>;
  },
}));

describe('CustomerPage', () => {
  beforeEach(() => {
    mockListProps.length = 0;
    mockDetailProps.length = 0;
    mockHistoryProps.length = 0;
    mockStatsProps.length = 0;
    jest.clearAllMocks();
  });

  it('renders layout header and title', () => {
    render(<CustomerPage />);
    expect(screen.getByText('Client Analytics')).toBeInTheDocument();
  });

  it('renders search input and filter controls', () => {
    render(<CustomerPage />);
    // FIXED: CustomerSearch component is mocked, use test-ids
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-VIP')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-Musician')).toBeInTheDocument();
    expect(screen.getByTestId('sort-select')).toBeInTheDocument();
  });

  it('handles search term changes', () => {
    render(<CustomerPage />);
    // FIXED: CustomerSearch component is mocked, use test-id
    const searchInput = screen.getByTestId('search-input') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'hello' } });
    expect(mockSetSearchTerm).toHaveBeenCalledWith('hello');
  });

  it('handles tag filter changes', () => {
    render(<CustomerPage />);
    // FIXED: CustomerSearch component is mocked, use test-id
    const vipButton = screen.getByTestId('tag-filter-VIP');
    fireEvent.click(vipButton);
    expect(mockSetTagFilter).toHaveBeenCalledWith('VIP');
  });

  it('handles sort changes', () => {
    render(<CustomerPage />);
    // FIXED: CustomerSearch component is mocked, use test-id
    const sortSelect = screen.getByTestId('sort-select') as HTMLSelectElement;
    fireEvent.change(sortSelect, { target: { value: 'spend' } });
    expect(mockSetSortBy).toHaveBeenCalledWith('spend');
  });

  it('passes customers and selection into CustomerList', () => {
    render(<CustomerPage />);
    expect(mockListProps[0].customers).toEqual(mockCustomers);
    expect(mockListProps[0].selectedId).toBe('c1');
  });

  it('updates selected customer via list onSelect', () => {
    render(<CustomerPage />);
    fireEvent.click(screen.getByTestId('customer-list'));
    expect(mockSetSelectedCustomerId).toHaveBeenCalledWith('c2');
  });

  it('renders CustomerDetail with selectedCustomer', () => {
    render(<CustomerPage />);
    expect(mockDetailProps[0].customer).toEqual(mockCustomers[0]);
    expect(screen.getByTestId('customer-detail')).toBeInTheDocument();
  });

  it('renders CustomerStats with customers', () => {
    render(<CustomerPage />);
    expect(mockStatsProps[0].customers).toEqual(mockCustomers);
    expect(screen.getByTestId('customer-stats')).toBeInTheDocument();
  });

  it('renders PurchaseHistory with status filter default All', () => {
    render(<CustomerPage />);
    expect(mockHistoryProps[0].statusFilter).toBe('All');
  });

  it('updates purchase status filter via PurchaseHistory callback', () => {
    render(<CustomerPage />);
    fireEvent.click(screen.getByTestId('purchase-history'));
    expect(mockHistoryProps[0].onStatusFilterChange).toBeDefined();
    // After callback, component state updates and mock records latest props
    expect(mockHistoryProps.at(-1)?.statusFilter).toBe('Completed');
  });
});
