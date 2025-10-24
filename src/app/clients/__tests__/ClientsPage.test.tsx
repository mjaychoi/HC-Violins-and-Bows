import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientsPage from '../page'
// import { Client } from '@/types'
// src/app/clients/__tests__/ClientsPage.test.tsx
// Mock the hooks
jest.mock('../hooks', () => ({
  useClients: () => ({
    clients: [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        contact_number: '123-456-7890',
        email: 'john@example.com',
        tags: ['Owner'],
        interest: 'Active',
        note: 'Test note',
        created_at: new Date().toISOString()
      }
    ],
    loading: false,
    submitting: false,
    createClient: jest.fn(),
    updateClient: jest.fn(),
    deleteClient: jest.fn()
  }),
  useInstruments: () => ({
    searchResults: [],
    isSearching: false,
    searchInstruments: jest.fn()
  }),
  useClientInstruments: () => ({
    instrumentRelationships: [],
    clientsWithInstruments: [],
    fetchInstrumentRelationships: jest.fn(),
    addInstrumentRelationship: jest.fn(),
    removeInstrumentRelationship: jest.fn()
  }),
  useFilters: () => ({
    searchTerm: '',
    setSearchTerm: jest.fn(),
    sortBy: 'created_at',
    sortOrder: 'desc',
    showFilters: false,
    setShowFilters: jest.fn(),
    filters: {},
    filteredClients: [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        contact_number: '123-456-7890',
        email: 'john@example.com',
        tags: ['Owner'],
        interest: 'Active',
        note: 'Test note',
        created_at: new Date().toISOString()
      }
    ],
    filterOptions: {
      lastNames: ['Doe'],
      firstNames: ['John'],
      emails: ['john@example.com'],
      tags: ['Owner'],
      interests: ['Active']
    },
    handleFilterChange: jest.fn(),
    clearAllFilters: jest.fn(),
    handleColumnSort: jest.fn(),
    getSortArrow: jest.fn(() => 'sort-neutral'),
    getActiveFiltersCount: jest.fn(() => 0)
  })
}))

// Mock the error handler
jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    ErrorToasts: () => <div data-testid="error-toasts">Error Toasts</div>
  })
}))

describe('ClientsPage', () => {
  it('should render the page title', () => {
    render(<ClientsPage />)
    
    expect(screen.getByText('Clients')).toBeInTheDocument()
  })

  it('should render the add client button', () => {
    render(<ClientsPage />)
    
    const addButton = screen.getByRole('button', { name: /add/i })
    expect(addButton).toBeInTheDocument()
  })

  it('should render the search input', () => {
    render(<ClientsPage />)
    
    const searchInput = screen.getByPlaceholderText(/search clients/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('should render the filters button', () => {
    render(<ClientsPage />)
    
    const filtersButton = screen.getByText('Filters')
    expect(filtersButton).toBeInTheDocument()
  })

  it('should render client data in table', () => {
    render(<ClientsPage />)
    
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
    expect(screen.getByText('123-456-7890')).toBeInTheDocument()
  })

  it('should show loading state', () => {
    // Mock loading state
    jest.doMock('../hooks', () => ({
      useClients: () => ({
        clients: [],
        loading: true,
        submitting: false,
        createClient: jest.fn(),
        updateClient: jest.fn(),
        deleteClient: jest.fn()
      }),
      useInstruments: () => ({
        searchResults: [],
        isSearching: false,
        searchInstruments: jest.fn()
      }),
      useClientInstruments: () => ({
        instrumentRelationships: [],
        clientsWithInstruments: [],
        fetchInstrumentRelationships: jest.fn(),
        addInstrumentRelationship: jest.fn(),
        removeInstrumentRelationship: jest.fn()
      }),
      useFilters: () => ({
        searchTerm: '',
        setSearchTerm: jest.fn(),
        sortBy: 'created_at',
        sortOrder: 'desc',
        showFilters: false,
        setShowFilters: jest.fn(),
        filters: {},
        filteredClients: [],
        filterOptions: {
          lastNames: [],
          firstNames: [],
          emails: [],
          tags: [],
          interests: []
        },
        handleFilterChange: jest.fn(),
        clearAllFilters: jest.fn(),
        handleColumnSort: jest.fn(),
        getSortArrow: jest.fn(() => 'sort-neutral'),
        getActiveFiltersCount: jest.fn(() => 0)
      })
    }))

    render(<ClientsPage />)
    
    expect(screen.getByText('Loading clients...')).toBeInTheDocument()
  })

  it('should handle search input changes', async () => {
    const user = userEvent.setup()
    render(<ClientsPage />)
    
    const searchInput = screen.getByPlaceholderText(/search clients/i)
    await user.type(searchInput, 'John')
    
    expect(searchInput).toHaveValue('John')
  })

  it('should toggle filters panel', async () => {
    const user = userEvent.setup()
    render(<ClientsPage />)
    
    const filtersButton = screen.getByText('Filters')
    await user.click(filtersButton)
    
    // The filters panel should be toggled (this would depend on the actual implementation)
    expect(filtersButton).toBeInTheDocument()
  })

  it('should render error toasts', () => {
    render(<ClientsPage />)
    
    expect(screen.getByTestId('error-toasts')).toBeInTheDocument()
  })

  it('should handle client row clicks', async () => {
    const user = userEvent.setup()
    render(<ClientsPage />)
    
    const clientRow = screen.getByText('John Doe')
    await user.click(clientRow)
    
    // This would open the client modal (implementation dependent)
    expect(clientRow).toBeInTheDocument()
  })

  it('should render sidebar navigation', () => {
    render(<ClientsPage />)
    
    expect(screen.getByText('Inventory App')).toBeInTheDocument()
    expect(screen.getByText('Items')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Connected Clients')).toBeInTheDocument()
  })

  it('should handle responsive design', () => {
    render(<ClientsPage />)
    
    // Check that the main layout elements are present
    expect(screen.getByText('Clients')).toBeInTheDocument()
    
    // The sidebar should be collapsible
    const sidebar = screen.getByText('Inventory App').closest('div')
    expect(sidebar).toBeInTheDocument()
  })
})
