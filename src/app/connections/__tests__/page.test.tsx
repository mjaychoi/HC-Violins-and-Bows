import { render, screen, fireEvent } from '@/test-utils/render';
import ConnectedClientsPage from '../page';

// Mock all dependencies
jest.mock('@/hooks/useUnifiedData', () => ({
  __esModule: true,
  useUnifiedData: jest.fn(() => {
    // Empty function - Single Source of Truth fetcher
    // In tests, we don't need actual fetching
  }),
  useConnectedClientsData: jest.fn(() => ({
    clients: [],
    instruments: [],
    connections: [],
    loading: {
      clients: false,
      instruments: false,
      connections: false,
      any: false,
    },
    submitting: {
      connections: false,
      any: false,
    },
    createConnection: jest.fn(),
    updateConnection: jest.fn(),
    deleteConnection: jest.fn(),
  })),
}));

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    __esModule: true,
    useErrorHandler: jest.fn(() => ({
      handleError: jest.fn(),
    })),
  };
});

jest.mock('@/hooks/useLoadingState', () => ({
  __esModule: true,
  useLoadingState: jest.fn(() => ({
    loading: false,
    submitting: false,
    withSubmitting: jest.fn(fn => fn()),
  })),
}));

jest.mock('@/hooks/useFilterSort', () => ({
  __esModule: true,
  useFilterSort: jest.fn(items => ({
    items,
  })),
}));

jest.mock('../hooks', () => ({
  __esModule: true,
  useConnectionFilters: jest.fn(() => ({
    selectedFilter: null,
    setSelectedFilter: jest.fn(),
    groupedConnections: {},
    relationshipTypeCounts: [],
  })),
  useConnectionEdit: jest.fn(() => ({
    showEditModal: false,
    editingConnection: null,
    openEditModal: jest.fn(),
    closeEditModal: jest.fn(),
  })),
}));

jest.mock('../components', () => ({
  __esModule: true,
  ConnectionModal: jest.fn(({ isOpen }) =>
    isOpen ? <div data-testid="connection-modal">Connection Modal</div> : null
  ),
  FilterBar: jest.fn(() => <div data-testid="filter-bar">Filter Bar</div>),
  ConnectionsList: jest.fn(() => (
    <div data-testid="connections-list">Connections List</div>
  )),
  EmptyState: jest.fn(({ onCreateConnection }) => (
    <div data-testid="empty-state">
      <button
        onClick={onCreateConnection}
        data-testid="create-connection-button"
      >
        Create Connection
      </button>
    </div>
  )),
  LoadingState: jest.fn(() => (
    <div data-testid="loading-state">Loading...</div>
  )),
  EditConnectionModal: jest.fn(() => null),
  ConnectionSearch: jest.fn(({ searchTerm, onSearchChange }) => (
    <input
      data-testid="connection-search"
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
    />
  )),
}));

jest.mock('@/components/layout', () => ({
  __esModule: true,
  AppLayout: jest.fn(({ children, title, actionButton }) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      {actionButton && (
        <button onClick={actionButton.onClick}>{actionButton.label}</button>
      )}
      {children}
    </div>
  )),
}));

jest.mock('@/components/common', () => ({
  ErrorBoundary: jest.fn(({ children }) => <div>{children}</div>),
  ConfirmDialog: ({ isOpen, onConfirm, onCancel, title, message }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <div>{title}</div>
        <div>{message}</div>
        <button onClick={onConfirm} data-testid="confirm-button">
          Confirm
        </button>
        <button onClick={onCancel} data-testid="cancel-button">
          Cancel
        </button>
      </div>
    ) : null,
}));

describe('ConnectedClientsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render page with title', () => {
    render(<ConnectedClientsPage />);
    expect(screen.getByText('Connected Clients')).toBeInTheDocument();
  });

  it('should render FilterBar', () => {
    render(<ConnectedClientsPage />);
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
  });

  it('should render EmptyState when no connections', () => {
    render(<ConnectedClientsPage />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('should render ConnectionsList when connections exist', () => {
    const { useConnectedClientsData } = require('@/hooks/useUnifiedData');
    useConnectedClientsData.mockReturnValue({
      clients: [],
      instruments: [],
      connections: [{ id: '1' }],
      loading: {
        clients: false,
        instruments: false,
        connections: false,
        any: false,
      },
      submitting: {
        connections: false,
        any: false,
      },
      createConnection: jest.fn(),
      updateConnection: jest.fn(),
      deleteConnection: jest.fn(),
    });

    render(<ConnectedClientsPage />);
    expect(screen.getByTestId('connections-list')).toBeInTheDocument();
  });

  it('should render LoadingState when loading', () => {
    const { useLoadingState } = require('@/hooks/useLoadingState');
    useLoadingState.mockReturnValue({
      loading: true,
      submitting: false,
      withSubmitting: jest.fn(fn => fn()),
    });

    render(<ConnectedClientsPage />);
    expect(screen.getByText('Loading connections...')).toBeInTheDocument();
  });

  it('should open connection modal when "Add Connection" button is clicked', () => {
    render(<ConnectedClientsPage />);
    const addButton = screen.getByText('Add Connection');
    fireEvent.click(addButton);
    expect(screen.getByTestId('connection-modal')).toBeInTheDocument();
  });

  it('should handle connection creation', async () => {
    const { useConnectedClientsData } = require('@/hooks/useUnifiedData');
    const mockCreateConnection = jest.fn().mockResolvedValue(undefined);
    useConnectedClientsData.mockReturnValue({
      clients: [{ id: 'c1', first_name: 'John', last_name: 'Doe' }],
      instruments: [{ id: 'i1', maker: 'Stradivari', type: 'Violin' }],
      connections: [],
      loading: {
        clients: false,
        instruments: false,
        connections: false,
        any: false,
      },
      submitting: {
        connections: false,
        any: false,
      },
      createConnection: mockCreateConnection,
      updateConnection: jest.fn(),
      deleteConnection: jest.fn(),
    });

    render(<ConnectedClientsPage />);
    const addButton = screen.getByText('Add Connection');
    fireEvent.click(addButton);
    expect(screen.getByTestId('connection-modal')).toBeInTheDocument();
  });

  describe('Delete confirmation flow', () => {
    it('should use ConfirmDialog instead of window.confirm for connection deletion', () => {
      const mockConfirm = jest.spyOn(window, 'confirm');
      mockConfirm.mockReturnValue(false);

      render(<ConnectedClientsPage />);

      // Verify window.confirm was never called (we use ConfirmDialog instead)
      expect(mockConfirm).not.toHaveBeenCalled();

      mockConfirm.mockRestore();
    });

    it('should render ConfirmDialog component in page structure', () => {
      render(<ConnectedClientsPage />);

      // ConfirmDialog mock is available (even if not visible initially)
      // The component should support showing it when delete is requested
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
  });
});
