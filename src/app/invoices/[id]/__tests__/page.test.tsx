import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoiceDetailPage from '../page';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import { useParams, useRouter } from 'next/navigation';

jest.mock('@/utils/apiFetch');
jest.mock('@/hooks/useAppFeedback');
jest.mock('@/hooks/usePermissions');
jest.mock('next/navigation', () => ({
  __esModule: true,
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));
jest.mock('next/dynamic', () => () => {
  const MockDynamic = () => null;
  MockDynamic.displayName = 'MockDynamic';
  return MockDynamic;
});
jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
jest.mock('@/components/common', () => ({
  ConfirmDialog: () => null,
  EmptyState: ({ title, description, actionButton }: any) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {actionButton ? (
        <button onClick={actionButton.onClick}>{actionButton.label}</button>
      ) : null}
    </div>
  ),
}));
jest.mock('@/components/common/inputs', () => ({
  Button: ({ children, onClick, disabled, title, variant }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../components/InvoiceSettingsPanel', () => ({
  __esModule: true,
  default: () => null,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockUseAppFeedback = useAppFeedback as jest.MockedFunction<
  typeof useAppFeedback
>;
const mockUsePermissions = usePermissions as jest.MockedFunction<
  typeof usePermissions
>;
const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('InvoiceDetailPage', () => {
  const mockHandleError = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'inv-1' } as any);
    mockUseRouter.mockReturnValue({ push: mockPush } as any);
    mockUseAppFeedback.mockReturnValue({
      showSuccess: mockShowSuccess,
      handleError: mockHandleError,
    } as any);
    mockUsePermissions.mockReturnValue({
      canEditInvoice: true,
      canDeleteInvoice: true,
      canManageInvoiceSettings: true,
    } as any);
  });

  it('renders retryable error UI instead of fake not-found on fetch failure', async () => {
    const failedResponse = {
      ok: false,
      status: 500,
      json: async () => ({ message: 'Database temporarily unavailable' }),
    };

    const successResponse = {
      ok: true,
      json: async () => ({
        data: {
          id: 'inv-1',
          invoice_number: 'INV-1',
          invoice_date: '2026-04-01',
          due_date: null,
          status: 'draft',
          currency: 'USD',
          total: 100,
          items: [],
          client: null,
        },
      }),
    };

    mockApiFetch
      .mockResolvedValueOnce(failedResponse as any)
      .mockResolvedValueOnce(successResponse as any);

    const user = userEvent.setup();
    render(<InvoiceDetailPage />);

    expect(
      await screen.findByText('Failed to load invoice')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Database temporarily unavailable')
    ).toBeInTheDocument();
    expect(screen.queryByText('Invoice not found')).not.toBeInTheDocument();

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('INV-1')).toBeInTheDocument();
    });
  });

  it('still renders not-found UI for confirmed 404 responses', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Invoice not found' }),
    } as any);

    render(<InvoiceDetailPage />);

    expect(await screen.findByText('Invoice not found')).toBeInTheDocument();
    expect(
      screen.queryByText('Failed to load invoice')
    ).not.toBeInTheDocument();
  });
});
