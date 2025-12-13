import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardPage from '../page';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { useDashboardFilters, useDashboardForm } from '../hooks';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useErrorHandler } from '@/hooks/useErrorHandler';

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedData: jest.fn(() => {
    // Empty function - Single Source of Truth fetcher
    // In tests, we don't need actual fetching
  }),
  useUnifiedDashboard: jest.fn(),
}));
jest.mock('../hooks', () => ({
  useDashboardFilters: jest.fn(),
  useDashboardForm: jest.fn(() => ({ resetForm: jest.fn() })),
}));
jest.mock('@/hooks/useModalState', () => ({
  useModalState: jest.fn(),
}));
jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: jest.fn(),
}));
jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: jest.fn(),
}));
jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: any) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));
jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: any) => (
    <div data-testid="error-boundary">{children}</div>
  ),
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

describe('DashboardPage', () => {
  const resetForm = jest.fn();
  const openModal = jest.fn();
  const closeModal = jest.fn();
  const deleteInstrument = jest.fn().mockResolvedValue(undefined);
  const createInstrument = jest.fn().mockResolvedValue(undefined);
  const updateInstrument = jest.fn().mockResolvedValue(true);
  const handleError = jest.fn();
  const withSubmitting = jest.fn(async (cb: any) => await cb());
  const ErrorToasts = () => <div>errors</div>;

  beforeEach(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: [mockInstrument],
      clients: [],
      loading: { any: false },
      submitting: { any: false },
      clientRelationships: [],
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

    (useLoadingState as jest.Mock).mockReturnValue({
      withSubmitting,
    });

    (useErrorHandler as jest.Mock).mockReturnValue({
      ErrorToasts,
      handleError,
    });
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
});
