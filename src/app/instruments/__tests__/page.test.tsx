import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstrumentsPage from '../page';
import {
  useUnifiedDashboard,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePageFilters } from '@/hooks/usePageFilters';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

jest.mock('@/utils/uniqueNumberGenerator', () => ({
  generateInstrumentSerialNumber: jest.fn(() => 'IN0000001'),
}));

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedData: jest.fn(() => {
    // Empty function - Single Source of Truth fetcher
    // In tests, we don't need actual fetching
  }),
  useUnifiedDashboard: jest.fn(),
  useUnifiedInstruments: jest.fn(),
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

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: jest.fn(),
}));

jest.mock('@/hooks/usePageFilters', () => ({
  usePageFilters: jest.fn(),
}));

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children, actionButton }: any) => (
    <div>
      <button onClick={actionButton.onClick}>open-modal</button>
      {children}
    </div>
  ),
}));

jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: any) => <div>{children}</div>,
  CardSkeleton: ({ count }: { count?: number }) => (
    <div data-testid="card-skeleton">Skeleton {count || 1}</div>
  ),
  SearchInput: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="search-input"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

// Mock next/dynamic to return component synchronously for testing
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    // Return the mocked InstrumentForm component directly
    const MockInstrumentForm = ({
      isOpen,
      onClose,
      onSubmit,
    }: {
      isOpen: boolean;
      onClose: () => void;
      onSubmit: (data: any) => Promise<void>;
    }) =>
      isOpen ? (
        <div>
          <button onClick={onClose}>close-form</button>
          <button
            onClick={() => onSubmit({ maker: 'M', name: 'N', year: '2020' })}
          >
            submit-form
          </button>
        </div>
      ) : null;
    return MockInstrumentForm;
  },
}));

jest.mock('../components/InstrumentForm', () => ({
  __esModule: true,
  default: ({
    isOpen,
    onClose,
    onSubmit,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
  }) =>
    isOpen ? (
      <div>
        <button onClick={onClose}>close-form</button>
        <button
          onClick={() => onSubmit({ maker: 'M', name: 'N', year: '2020' })}
        >
          submit-form
        </button>
      </div>
    ) : null,
}));

jest.mock('../components/InstrumentList', () => ({
  __esModule: true,
  default: ({ onAddInstrument }: { onAddInstrument: () => void }) => (
    <button onClick={onAddInstrument}>list-add</button>
  ),
}));

jest.mock('../components/InstrumentFilters', () => ({
  __esModule: true,
  default: () => <div data-testid="instrument-filters">Filters</div>,
}));

const mockInstruments = [
  {
    id: '1',
    maker: 'M',
    type: 'T',
    status: 'Available',
    year: 2020,
    certificate: false,
    subtype: null,
    size: null,
    weight: null,
    price: null,
    ownership: null,
    note: null,
    serial_number: 'SN',
    created_at: '2024',
  },
];

describe('InstrumentsPage', () => {
  const openModal = jest.fn();
  const closeModal = jest.fn();
  const withSubmitting = jest.fn(async (cb: any) => await cb());
  const createInstrument = jest.fn().mockResolvedValue(undefined);
  const handleError = jest.fn();
  const showSuccess = jest.fn();
  const ErrorToasts = () => <div>errors</div>;
  const SuccessToasts = () => <div>success</div>;

  beforeEach(() => {
    createInstrument.mockResolvedValue(undefined);
    createInstrument.mockClear();
    withSubmitting.mockClear();
    withSubmitting.mockImplementation(async (cb: any) => await cb());
    openModal.mockClear();
    closeModal.mockClear();
    (generateInstrumentSerialNumber as jest.Mock).mockReturnValue('IN0000001');

    (useUnifiedDashboard as jest.Mock).mockReturnValue({
      instruments: mockInstruments,
      loading: { any: false },
      submitting: { any: false },
      createInstrument,
    } as any);

    (useUnifiedInstruments as jest.Mock).mockReturnValue({
      instruments: mockInstruments,
    } as any);

    (useModalState as jest.Mock).mockReturnValue({
      isOpen: false,
      openModal,
      closeModal,
    } as any);

    (useLoadingState as jest.Mock).mockReturnValue({
      withSubmitting,
    } as any);

    (useErrorHandler as jest.Mock).mockReturnValue({
      ErrorToasts,
      handleError,
    } as any);

    (useAppFeedback as jest.Mock).mockReturnValue({
      ErrorToasts,
      SuccessToasts,
      handleError,
      showSuccess,
    } as any);

    (usePageFilters as jest.Mock).mockReturnValue({
      searchTerm: '',
      setSearchTerm: jest.fn(),
      showFilters: false,
      setShowFilters: jest.fn(),
      filters: {},
      filteredItems: mockInstruments,
      filterOptions: {
        maker: [],
        status: [],
      },
      handleFilterChange: jest.fn(),
      clearAllFilters: jest.fn(),
      getActiveFiltersCount: jest.fn(() => 0),
    } as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('opens modal from action button and closes via form', async () => {
    render(<InstrumentsPage />);

    fireEvent.click(screen.getByText('open-modal'));
    expect(openModal).toHaveBeenCalled();

    // simulate form open
    (useModalState as jest.Mock).mockReturnValue({
      isOpen: true,
      openModal,
      closeModal,
    } as any);
    render(<InstrumentsPage />);

    fireEvent.click(screen.getByText('close-form'));
    expect(closeModal).toHaveBeenCalled();
  });

  it('submits instrument form with generated serial number', async () => {
    (useModalState as jest.Mock).mockReturnValue({
      isOpen: true,
      openModal,
      closeModal,
    } as any);

    render(<InstrumentsPage />);

    fireEvent.click(screen.getByText('submit-form'));

    await waitFor(() => expect(withSubmitting).toHaveBeenCalled());
    await waitFor(() =>
      expect(createInstrument).toHaveBeenCalledWith(
        expect.objectContaining({
          maker: 'M',
          type: 'N',
          serial_number: expect.stringMatching(/^[A-Z]{2}\d{7}$/),
        })
      )
    );
    expect(closeModal).toHaveBeenCalled();
  });
});
