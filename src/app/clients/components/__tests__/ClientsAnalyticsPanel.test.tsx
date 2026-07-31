import React from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
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

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/utils/handleApiResponse', () => ({
  readApiResponseEnvelope: jest.fn(),
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'org:test' }),
}));

describe('ClientsAnalyticsPanel', () => {
  const { apiFetch } = require('@/utils/apiFetch');
  const { readApiResponseEnvelope } = require('@/utils/handleApiResponse');

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockResolvedValue({ ok: true });
    readApiResponseEnvelope.mockResolvedValue({
      data: {
        customerCount: 1001,
        clientsWithPurchases: 10,
        totalSpend: 5000,
        purchaseCount: 20,
        avgSpendPerCustomer: 500,
        mostRecentPurchaseDate: '2026-07-01',
        scope: 'organization',
        fromDate: null,
        toDate: null,
      },
      complete: true,
    });
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<ClientsAnalyticsPanel enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders organization-wide analytics without truncation warning', async () => {
    render(<ClientsAnalyticsPanel enabled />);

    await waitFor(() => {
      expect(screen.getByTestId('customer-stats')).toBeInTheDocument();
    });
    expect(screen.getByTestId('clients-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('customer-list')).toBeInTheDocument();
    expect(screen.getByTestId('analytics-scope-note')).toHaveTextContent(
      /organization-wide/i
    );
    expect(
      screen.queryByTestId('analytics-truncated-warning')
    ).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/api/clients/analytics');
  });
});
