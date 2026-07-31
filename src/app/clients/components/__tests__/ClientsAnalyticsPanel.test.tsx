import React from 'react';
import { render, screen } from '@/test-utils/render';
import ClientsAnalyticsPanel from '../ClientsAnalyticsPanel';

const mockSetSearchTerm = jest.fn();
const mockSetTagFilter = jest.fn();
const mockSetSortBy = jest.fn();
const mockSetSelectedCustomerId = jest.fn();
const mockRefetch = jest.fn();
const mockRefetchSelectedCustomer = jest.fn();

jest.mock('../../analytics/hooks/useCustomers', () => ({
  useCustomers: jest.fn(() => ({
    customers: [
      {
        id: 'c1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        tags: ['Musician'],
        totalSpend: 1000,
        purchaseCount: 2,
        purchases: [],
      },
    ],
    allCustomersCount: 1,
    searchTerm: '',
    setSearchTerm: mockSetSearchTerm,
    tagFilter: null,
    setTagFilter: mockSetTagFilter,
    sortBy: 'name',
    setSortBy: mockSetSortBy,
    selectedCustomerId: null,
    setSelectedCustomerId: mockSetSelectedCustomerId,
    selectedCustomer: null,
    availableTags: ['Musician'],
    status: 'success',
    refetch: mockRefetch,
    loading: false,
    selectedCustomerPurchasesStatus: 'idle',
    selectedCustomerPurchasesError: null,
    refetchSelectedCustomer: mockRefetchSelectedCustomer,
  })),
}));

jest.mock('../../analytics/components/CustomerStats', () => ({
  CustomerStats: () => <div data-testid="customer-stats">Customer stats</div>,
}));
jest.mock('../../analytics/components/CustomerSearch', () => ({
  CustomerSearch: () => <div data-testid="customer-search">Search</div>,
}));
jest.mock('../../analytics/components/CustomerList', () => ({
  CustomerList: () => <div data-testid="customer-list">Customer list</div>,
}));
jest.mock('../../analytics/components/CustomerDetail', () => ({
  CustomerDetail: () => <div data-testid="customer-detail">Detail</div>,
}));
jest.mock('../../analytics/components/PurchaseHistory', () => ({
  PurchaseHistory: () => <div data-testid="purchase-history">Purchases</div>,
}));

describe('ClientsAnalyticsPanel', () => {
  it('renders nothing when disabled', () => {
    const { container } = render(
      <ClientsAnalyticsPanel enabled={false} clientsTruncated={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders analytics content when enabled', () => {
    render(<ClientsAnalyticsPanel enabled clientsTruncated={false} />);

    expect(screen.getByTestId('clients-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('customer-stats')).toBeInTheDocument();
    expect(screen.getByTestId('customer-list')).toBeInTheDocument();
    expect(screen.getByTestId('analytics-scope-note')).toHaveTextContent(
      /organization/i
    );
    expect(
      screen.queryByTestId('analytics-truncated-warning')
    ).not.toBeInTheDocument();
  });

  it('shows an incomplete-data warning when the client collection is truncated', () => {
    render(<ClientsAnalyticsPanel enabled clientsTruncated />);

    expect(screen.getByTestId('analytics-truncated-warning')).toHaveTextContent(
      /incomplete/i
    );
    expect(screen.getByTestId('analytics-scope-note')).toHaveTextContent(
      /currently loaded client set/i
    );
  });
});
