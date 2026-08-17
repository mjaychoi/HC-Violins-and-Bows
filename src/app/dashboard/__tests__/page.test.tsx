import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import DashboardPage from '../page';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { useDashboardFilters, useDashboardForm } from '../hooks';
import { useModalState } from '@/hooks/useModalState';
import { useErrorHandler } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedData: jest.fn(() => {
    // Empty function - Single Source of Truth fetcher
    // In tests, we don't need actual fetching
  }),
  useUnifiedDashboard: jest.fn(),
  useUnifiedClients: jest.fn(() => ({
    clients: [],
    loading: { clients: false, any: false, hasAnyLoading: false },
    submitting: { clients: false, any: false, hasAnySubmitting: false },
  })),
  useUnifiedInstruments: jest.fn(() => ({
    instruments: [],
    loading: { instruments: false, any: false, hasAnyLoading: false },
    submitting: { instruments: false, any: false, hasAnySubmitting: false },
  })),
}));

jest.mock('../hooks', () => ({
  useDashboardFilters: jest.fn(),
  useDashboardForm: jest.fn(() => ({ resetForm: jest.fn() })),
}));

const mockDeepLink = {
  status: 'idle' as string,
  instrumentId: null as string | null,
  target: null as unknown,
  clearDeepLink: jest.fn(),
  retry: jest.fn(),
};

jest.mock('../hooks/useDashboardInstrumentDeepLink', () => ({
  useDashboardInstrumentDeepLink: () => mockDeepLink,
}));

jest.mock('@/hooks/useModalState', () => ({
  useModalState: jest.fn(),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(),
}));

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: jest.fn(() => ({
      handleError: jest.fn(),
    })),
  };
});

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children, headerActions }: any) => (
    <div data-testid="app-layout">
      {headerActions}
      {children}
    </div>
  ),
}));

jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: any) => (
    <div data-testid="error-boundary">{children}</div>
  ),
  NotificationBadge: () => <div data-testid="notification-badge" />,
  ConfirmDialog: ({ onConfirm }: any) => {
    // Auto-confirm in tests
    onConfirm?.();
    return null;
  },
  SuccessToast: () => null,
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../components', () => ({
  ItemFilters: ({ onToggleFilters, showFilters, onSearchChange }: any) => (
    <div>
      <button onClick={() => onSearchChange('term')}>search</button>
      <button onClick={onToggleFilters}>{showFilters ? 'hide' : 'show'}</button>
    </div>
  ),
  ItemList: ({ onDeleteClick, onUpdateItem, onSort }: any) => (
    <div>
      <button onClick={() => onDeleteClick({ id: '1' })}>delete</button>
      <button onClick={() => onUpdateItem('1', { maker: 'Updated' })}>
        update
      </button>
      <button onClick={() => onSort('maker')}>sort</button>
    </div>
  ),
  ItemForm: ({ isOpen, onClose, onSubmit }: any) =>
    isOpen ? (
      <div>
        <button onClick={onClose}>close-form</button>
        <button onClick={() => onSubmit({ maker: 'M' })}>submit-form</button>
      </div>
    ) : null,
  DashboardContent: (props: {
    onDeleteClick?: (item: { id: string }) => void;
    onUpdateItemInline?: (id: string, updates: { maker: string }) => void;
    onSort?: (field: string) => void;
    itemsTruncated?: boolean;
    authoritativeTotalCount?: number | null;
    baseLoadedCount?: number;
    enrichedItems?: unknown[];
  }) => (
    <div data-testid="dashboard-content">
      <span data-testid="items-truncated">
        {String(Boolean(props.itemsTruncated))}
      </span>
      <span data-testid="authoritative-total">
        {String(props.authoritativeTotalCount ?? '')}
      </span>
      <span data-testid="base-loaded-count">
        {String(props.baseLoadedCount ?? '')}
      </span>
      <span data-testid="enriched-count">
        {String(props.enrichedItems?.length ?? 0)}
      </span>
      <button onClick={() => props.onDeleteClick?.({ id: '1' })}>delete</button>
      <button
        onClick={() => props.onUpdateItemInline?.('1', { maker: 'Updated' })}
      >
        update
      </button>
      <button onClick={() => props.onSort?.('maker')}>sort</button>
    </div>
  ),
}));

const mockInstrument = {
  id: '1',
  maker: 'Strad',
  type: 'Violin',
  subtype: null,
  year: 2020,
  certificate: false,
  size: null,
  weight: null,
  price: null,
  ownership: null,
  note: null,
  serial_number: 'VI0000001',
  status: 'Available',
  created_at: '2024',
};

const mockUsePermissions = usePermissions as jest.MockedFunction<
  typeof usePermissions
>;

describe('DashboardPage', () => {
  const resetForm = jest.fn();
  const openModal = jest.fn();
  const closeModal = jest.fn();
  const deleteInstrument = jest.fn().mockResolvedValue(undefined);
  const createInstrument = jest.fn().mockResolvedValue(mockInstrument);
  const updateInstrument = jest.fn().mockResolvedValue(mockInstrument);
  const fetchClients = jest.fn().mockResolvedValue(undefined);
  const fetchInstruments = jest.fn().mockResolvedValue(undefined);
  const fetchConnections = jest.fn().mockResolvedValue(undefined);
  const handleError = jest.fn();
  const ErrorToasts = () => <div>errors</div>;

  beforeEach(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeepLink.status = 'idle';
    mockDeepLink.instrumentId = null;
    mockDeepLink.target = null;
    mockDeepLink.clearDeepLink.mockClear();
    mockDeepLink.retry.mockClear();

    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: [mockInstrument],
      clients: [],
      loading: {
        clients: false,
        instruments: false,
        connections: false,
        any: false,
        hasAnyLoading: false,
      },
      errors: {
        clients: null,
        instruments: null,
        connections: null,
        any: false,
        hasAnyError: false,
      },
      submitting: {
        instruments: false,
        connections: false,
        any: false,
        hasAnySubmitting: false,
      },
      clientRelationships: [],
      fetchClients,
      fetchInstruments,
      fetchConnections,
      createInstrument,
      updateInstrument,
      deleteInstrument,
    });

    (useDashboardFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: jest.fn(),
      showFilters: false,
      setShowFilters: jest.fn(),
      filters: {
        status: [],
        maker: [],
        type: [],
        subtype: [],
        ownership: [],
        certificate: [],
        priceRange: { min: '', max: '' },
        hasClients: [] as boolean[],
      },
      filteredItems: [mockInstrument],
      handleFilterChange: jest.fn(),
      handlePriceRangeChange: jest.fn(),
      clearAllFilters: jest.fn(),
      handleSort: jest.fn(),
      getSortArrow: jest.fn(),
      getActiveFiltersCount: jest.fn(() => 0),
    });

    (useDashboardForm as jest.Mock).mockReturnValue({ resetForm });

    (useModalState as jest.Mock).mockReturnValue({
      isOpen: true,
      isEditing: false,
      openModal,
      closeModal,
      selectedItem: null,
    });

    (useErrorHandler as jest.Mock).mockReturnValue({
      ErrorToasts,
      handleError,
    });

    mockUsePermissions.mockReturnValue({
      canCreateInstrument: true,
      canCreateInvoice: true,
      canCreateTask: true,
      canCreateContactLog: true,
      canCreateNote: true,
      canCreateConnection: true,
      canManageContactLogs: true,
      canManageTasks: true,
      canManageSales: true,
      canExportSales: true,
      canEditInvoice: true,
      canDeleteInvoice: true,
      canManageInvoiceSettings: true,
      canDeleteConnection: true,
      canManageConnections: true,
      canManageInstruments: true,
      canUploadInstrumentMedia: true,
      canManageClients: true,
      canCreateClient: true,
      createInstrumentDisabledReason: undefined,
      exportSalesDisabledReason: undefined,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('opens modal from action button and closes form', () => {
    render(<DashboardPage />);

    fireEvent.click(screen.getByText('close-form'));
    expect(closeModal).toHaveBeenCalled();
  });

  it('handles create/update/delete flows', async () => {
    render(<DashboardPage />);

    fireEvent.click(screen.getByText('submit-form'));
    await waitFor(() => expect(createInstrument).toHaveBeenCalled());

    fireEvent.click(screen.getByText('update'));
    await waitFor(() =>
      expect(updateInstrument).toHaveBeenCalledWith('1', { maker: 'Updated' })
    );

    fireEvent.click(screen.getByText('delete'));
    expect(deleteInstrument).toHaveBeenCalledWith('1');
  });

  it('clears the instrument deep link after deleting that Item', async () => {
    mockDeepLink.status = 'ready';
    mockDeepLink.instrumentId = '1';
    mockDeepLink.target = mockInstrument;

    render(<DashboardPage />);

    fireEvent.click(screen.getByText('delete'));
    await waitFor(() => expect(deleteInstrument).toHaveBeenCalledWith('1'));
    expect(mockDeepLink.clearDeepLink).toHaveBeenCalled();
  });

  it('does not clear an unrelated instrument deep link when another Item is deleted', async () => {
    mockDeepLink.status = 'ready';
    mockDeepLink.instrumentId = 'other-id';
    mockDeepLink.target = mockInstrument;

    render(<DashboardPage />);

    fireEvent.click(screen.getByText('delete'));
    await waitFor(() => expect(deleteInstrument).toHaveBeenCalledWith('1'));
    expect(mockDeepLink.clearDeepLink).not.toHaveBeenCalled();
  });

  it('renders explicit dashboard error state instead of empty UI and retries bootstrap fetches', async () => {
    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: [],
      clients: [],
      loading: {
        clients: false,
        instruments: false,
        connections: false,
        any: false,
        hasAnyLoading: false,
      },
      errors: {
        clients: null,
        instruments: new Error('Fetch instruments failed'),
        connections: null,
        any: true,
        hasAnyError: true,
      },
      submitting: {
        instruments: false,
        connections: false,
        any: false,
        hasAnySubmitting: false,
      },
      clientRelationships: [],
      fetchClients,
      fetchInstruments,
      fetchConnections,
      createInstrument,
      updateInstrument,
      deleteInstrument,
    });

    render(<DashboardPage />);

    expect(screen.getByText('Failed to load dashboard')).toBeInTheDocument();
    expect(screen.getByText('Fetch instruments failed')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(fetchClients).toHaveBeenCalledWith({ force: true });
      expect(fetchInstruments).toHaveBeenCalledWith({ all: true });
      expect(fetchConnections).toHaveBeenCalledWith({
        force: true,
        all: true,
      });
    });
  });

  it('does not inflate base loaded count with a deep-linked Item', () => {
    const extra = { ...mockInstrument, id: 'deep-link-only' };
    mockDeepLink.status = 'ready';
    mockDeepLink.instrumentId = extra.id;
    mockDeepLink.target = extra;

    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: [mockInstrument],
      allInstrumentResultsTruncated: true,
      allInstrumentResultsTotalCount: 1237,
      allInstrumentResultsLoadedCount: 1000,
      clients: [],
      loading: {
        clients: false,
        instruments: false,
        connections: false,
        any: false,
        hasAnyLoading: false,
      },
      errors: {
        clients: null,
        instruments: null,
        connections: null,
        any: false,
        hasAnyError: false,
      },
      submitting: {
        instruments: false,
        connections: false,
        any: false,
        hasAnySubmitting: false,
      },
      clientRelationships: [],
      fetchClients,
      fetchInstruments,
      fetchConnections,
      createInstrument,
      updateInstrument,
      deleteInstrument,
    });

    render(<DashboardPage />);

    expect(screen.getByTestId('base-loaded-count')).toHaveTextContent('1000');
    expect(screen.getByTestId('enriched-count')).toHaveTextContent('2');
    expect(screen.getByTestId('authoritative-total')).toHaveTextContent('1237');
    expect(screen.getByTestId('items-truncated')).toHaveTextContent('true');
  });
});
