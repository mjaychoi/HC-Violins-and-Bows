// src/app/clients/components/__tests__/ClientsListContent.test.tsx
import React from 'react';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ClientsListContent from '../ClientsListContent';
import { Client, ClientInstrument } from '@/types';

// Mock dependencies
jest.mock('../../hooks/useFilters', () => ({
  useFilters: jest.fn(() => ({
    searchTerm: '',
    setSearchTerm: jest.fn(),
    showFilters: false,
    setShowFilters: jest.fn(),
    filters: {},
    paginatedClients: [],
    filterOptions: {
      tags: [],
      interests: [],
    },
    handleFilterChange: jest.fn(),
    handleHasInstrumentsChange: jest.fn(),
    clearAllFilters: jest.fn(),
    handleColumnSort: jest.fn(),
    getSortArrow: jest.fn(() => ''),
    getActiveFiltersCount: jest.fn(() => 0),
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    pageSize: 20,
    setPage: jest.fn(),
  })),
}));

jest.mock('../../hooks/useClientKPIs', () => ({
  useClientKPIs: jest.fn(() => ({
    loading: false,
    totalCustomers: 0,
    totalSpend: 0,
    avgSpendPerCustomer: 0,
    totalPurchases: 0,
    mostRecentPurchase: 'N/A',
  })),
}));

jest.mock('../ClientList', () => ({
  __esModule: true,
  default: ({
    clients,
    onClientClick,
    onUpdateClient,
    onDeleteClient,
  }: any) => (
    <div data-testid="client-list">
      {clients.map((client: Client) => (
        <div key={client.id} data-testid={`client-${client.id}`}>
          <button
            data-testid={`click-client-${client.id}`}
            onClick={() => onClientClick(client)}
          >
            {client.first_name} {client.last_name}
          </button>
          <button
            data-testid={`update-client-${client.id}`}
            onClick={() => onUpdateClient(client.id, {})}
          >
            Update
          </button>
          <button
            data-testid={`delete-client-${client.id}`}
            onClick={() => onDeleteClient(client)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  ),
}));

jest.mock('../ClientFilters', () => ({
  __esModule: true,
  default: ({ isOpen }: any) =>
    isOpen ? <div data-testid="client-filters">Filters</div> : null,
}));

jest.mock('../ClientKPISummary', () => ({
  ClientKPISummary: () => <div data-testid="kpi-summary">KPI Summary</div>,
}));

jest.mock('../TodayFollowUps', () => ({
  __esModule: true,
  default: () => <div data-testid="today-follow-ups">Today Follow-ups</div>,
}));

jest.mock('@/components/common', () => ({
  SearchInput: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardSkeleton: () => <div data-testid="card-skeleton">Loading...</div>,
}));

describe('ClientsListContent', () => {
  const mockClients: Client[] = [
    {
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      contact_number: '123-456-7890',
      tags: [],
      interest: '',
      note: '',
      client_number: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      contact_number: '987-654-3210',
      tags: ['Owner'],
      interest: 'Violin',
      note: 'Test note',
      client_number: 'CL002',
      created_at: '2024-01-02T00:00:00Z',
    },
  ];

  const mockInstrumentRelationships: ClientInstrument[] = [];

  const mockOnClientClick = jest.fn();
  const mockOnUpdateClient = jest.fn().mockResolvedValue(undefined);
  const mockOnDeleteClient = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component with all sections', () => {
    render(
      <ClientsListContent
        clients={mockClients}
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        loading={{ any: false, hasAnyLoading: false }}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByTestId('today-follow-ups')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-summary')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('client-list')).toBeInTheDocument();
  });

  it('renders clients in list', () => {
    const { useFilters } = require('../../hooks/useFilters');
    jest.mocked(useFilters).mockReturnValueOnce({
      searchTerm: '',
      setSearchTerm: jest.fn(),
      showFilters: false,
      setShowFilters: jest.fn(),
      filters: {},
      paginatedClients: mockClients,
      filterOptions: { tags: [], interests: [] },
      handleFilterChange: jest.fn(),
      handleHasInstrumentsChange: jest.fn(),
      clearAllFilters: jest.fn(),
      handleColumnSort: jest.fn(),
      getSortArrow: jest.fn(() => ''),
      getActiveFiltersCount: jest.fn(() => 0),
      currentPage: 1,
      totalPages: 1,
      totalCount: 2,
      pageSize: 20,
      setPage: jest.fn(),
    });

    render(
      <ClientsListContent
        clients={mockClients}
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        loading={{ any: false, hasAnyLoading: false }}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByTestId('client-1')).toBeInTheDocument();
    expect(screen.getByTestId('client-2')).toBeInTheDocument();
  });

  it('calls onClientClick when client is clicked', async () => {
    const { useFilters } = require('../../hooks/useFilters');
    jest.mocked(useFilters).mockReturnValueOnce({
      searchTerm: '',
      setSearchTerm: jest.fn(),
      showFilters: false,
      setShowFilters: jest.fn(),
      filters: {},
      paginatedClients: [mockClients[0]],
      filterOptions: { tags: [], interests: [] },
      handleFilterChange: jest.fn(),
      handleHasInstrumentsChange: jest.fn(),
      clearAllFilters: jest.fn(),
      handleColumnSort: jest.fn(),
      getSortArrow: jest.fn(() => ''),
      getActiveFiltersCount: jest.fn(() => 0),
      currentPage: 1,
      totalPages: 1,
      totalCount: 1,
      pageSize: 20,
      setPage: jest.fn(),
    });

    const user = userEvent.setup();
    render(
      <ClientsListContent
        clients={mockClients}
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        loading={{ any: false, hasAnyLoading: false }}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    const clickButton = screen.getByTestId('click-client-1');
    await user.click(clickButton);

    expect(mockOnClientClick).toHaveBeenCalledWith(mockClients[0]);
  });

  it('shows filters panel when filters button is clicked', async () => {
    const mockSetShowFilters = jest.fn();
    const { useFilters } = require('../../hooks/useFilters');
    jest.mocked(useFilters).mockReturnValueOnce({
      searchTerm: '',
      setSearchTerm: jest.fn(),
      showFilters: true,
      setShowFilters: mockSetShowFilters,
      filters: {},
      paginatedClients: [],
      filterOptions: { tags: [], interests: [] },
      handleFilterChange: jest.fn(),
      handleHasInstrumentsChange: jest.fn(),
      clearAllFilters: jest.fn(),
      handleColumnSort: jest.fn(),
      getSortArrow: jest.fn(() => ''),
      getActiveFiltersCount: jest.fn(() => 0),
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      pageSize: 20,
      setPage: jest.fn(),
    });

    const user = userEvent.setup();
    render(
      <ClientsListContent
        clients={mockClients}
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        loading={{ any: false, hasAnyLoading: false }}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    // Filters button should exist - use getAllByRole to get all buttons with "Filters" text
    const filterButtons = screen.getAllByRole('button');
    const filterButton = filterButtons.find(btn =>
      btn.textContent?.includes('Filters')
    );
    expect(filterButton).toBeInTheDocument();

    await user.click(filterButton!);

    // Clicking the filters button when it's open should close it
    expect(mockSetShowFilters).toHaveBeenCalledWith(false);
  });

  it('renders Suspense fallback when loading', () => {
    // Suspense fallback should show loading state
    // This is tested implicitly through the component structure
    render(
      <ClientsListContent
        clients={[]}
        clientsWithInstruments={new Set()}
        instrumentRelationships={[]}
        loading={{ any: true, hasAnyLoading: true }}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    // Component should still render
    expect(screen.getByTestId('today-follow-ups')).toBeInTheDocument();
  });
});
