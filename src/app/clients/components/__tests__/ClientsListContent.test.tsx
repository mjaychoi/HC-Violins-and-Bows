// src/app/clients/components/__tests__/ClientsListContent.test.tsx
import React from 'react';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ClientsListContent from '../ClientsListContent';
import { Client, ClientInstrument } from '@/types';

const mockCollection = {
  pageRows: [] as Client[],
  paginatedClients: [] as Client[],
  totalCount: 0,
  totalPages: 1,
  page: 1,
  pageSize: 20,
  loading: false,
  refreshing: false,
  error: null as unknown,
  searchTerm: '',
  setSearchTerm: jest.fn(),
  filters: {
    last_name: [],
    first_name: [],
    contact_number: [],
    email: [],
    tags: [],
    interest: [],
    hasInstruments: [],
  },
  showFilters: false,
  setShowFilters: jest.fn(),
  filterOptions: {
    lastNames: [],
    firstNames: [],
    contactNumbers: [],
    emails: [],
    tags: [],
    interests: [],
  },
  handleFilterChange: jest.fn(),
  handleHasInstrumentsChange: jest.fn(),
  clearAllFilters: jest.fn(),
  handleColumnSort: jest.fn(),
  getSortArrow: jest.fn(() => ''),
  getActiveFiltersCount: jest.fn(() => 0),
  setPage: jest.fn(),
  refetch: jest.fn(),
  fetchClientById: jest.fn().mockResolvedValue(null),
  cacheSelectedClient: jest.fn(),
  clearSelectedClient: jest.fn(),
};

jest.mock('../../hooks/useClientCollection', () => ({
  useClientCollection: jest.fn(() => mockCollection),
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
    mockCollection.pageRows = [];
    mockCollection.paginatedClients = [];
    mockCollection.totalCount = 0;
    mockCollection.loading = false;
    mockCollection.error = null;
    mockCollection.showFilters = false;
    mockCollection.getActiveFiltersCount = jest.fn(() => 0);
  });

  it('renders component with all sections', () => {
    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('client-list')).toBeInTheDocument();
  });

  it('renders clients in list from server collection', () => {
    mockCollection.paginatedClients = mockClients;
    mockCollection.pageRows = mockClients;
    mockCollection.totalCount = 2;

    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByTestId('client-1')).toBeInTheDocument();
    expect(screen.getByTestId('client-2')).toBeInTheDocument();
  });

  it('calls onClientClick when client is clicked', async () => {
    mockCollection.paginatedClients = [mockClients[0]];
    mockCollection.pageRows = [mockClients[0]];

    const user = userEvent.setup();
    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
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
    mockCollection.setShowFilters = mockSetShowFilters;

    const user = userEvent.setup();
    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    await user.click(screen.getByText('Filters'));
    expect(mockSetShowFilters).toHaveBeenCalled();
  });

  it('shows initial fetch error with retry instead of empty list', () => {
    mockCollection.error = new Error('network');
    mockCollection.pageRows = [];
    mockCollection.paginatedClients = [];
    mockCollection.loading = false;

    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Could not load clients/i
    );
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId('client-list')).not.toBeInTheDocument();
  });

  it('preserves rows and shows refresh warning on refetch failure', () => {
    mockCollection.error = new Error('network');
    mockCollection.pageRows = mockClients;
    mockCollection.paginatedClients = mockClients;

    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Could not refresh the client list/i
    );
    expect(screen.getByTestId('client-1')).toBeInTheDocument();
  });

  it('does not show the legacy 1,000-row truncation banner', () => {
    mockCollection.paginatedClients = mockClients;
    mockCollection.pageRows = mockClients;
    mockCollection.totalCount = 1001;

    render(
      <ClientsListContent
        clientsWithInstruments={new Set()}
        instrumentRelationships={mockInstrumentRelationships}
        onClientClick={mockOnClientClick}
        onUpdateClient={mockOnUpdateClient}
        onDeleteClient={mockOnDeleteClient}
      />
    );

    expect(
      screen.queryByText(/Showing the first 1,000 clients only/i)
    ).not.toBeInTheDocument();
  });
});
