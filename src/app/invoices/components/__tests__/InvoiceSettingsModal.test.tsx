import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoiceSettingsModal from '../InvoiceSettingsModal';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';

jest.mock('@/utils/apiFetch');
jest.mock('@/hooks/useAppFeedback');
jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({
    tenantIdentityKey: 'user:test-org:session',
    isTenantTransitioning: false,
  }),
}));
jest.mock('@/components/common/modals/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="modal">
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));
jest.mock('@/components/common/inputs', () => ({
  Button: ({ children, onClick, disabled, type, variant, loading }: any) => (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-loading={loading ? 'true' : 'false'}
    >
      {children}
    </button>
  ),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockUseAppFeedback = useAppFeedback as jest.MockedFunction<
  typeof useAppFeedback
>;

describe('InvoiceSettingsModal', () => {
  const mockHandleError = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppFeedback.mockReturnValue({
      showSuccess: mockShowSuccess,
      handleError: mockHandleError,
    } as any);
  });

  it('renders retryable error state instead of empty form when load fails', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: {
          get: (key: string) =>
            key === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({ message: 'Settings unavailable' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) =>
            key === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          data: {
            business_name: 'HC Violins',
            address: '',
            phone: '',
            email: '',
            bank_account_holder: '',
            bank_name: '',
            bank_swift_code: '',
            bank_account_number: '',
            default_conditions: '',
            default_exchange_rate: '',
            default_currency: 'USD',
          },
        }),
      } as any);

    const user = userEvent.setup();
    render(<InvoiceSettingsModal isOpen onClose={mockOnClose} />);

    expect(
      await screen.findByText('Failed to load invoice settings')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument();

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('HC Violins')).toBeInTheDocument();
    });
  });

  it('renders default empty state when settings response data is null', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: null, success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as any
    );

    render(<InvoiceSettingsModal isOpen onClose={mockOnClose} />);

    expect(await screen.findByText('Banking Information')).toBeInTheDocument();
    expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
    expect(
      screen.queryByText('Failed to load invoice settings')
    ).not.toBeInTheDocument();
  });

  it('shows meaningful permission errors from the API envelope', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'ADMIN_REQUIRED',
            message: 'Admin role required',
            retryable: false,
          },
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      ) as any
    );

    render(<InvoiceSettingsModal isOpen onClose={mockOnClose} />);

    expect(
      await screen.findByText('Failed to load invoice settings')
    ).toBeInTheDocument();
    expect(screen.getByText('Admin role required')).toBeInTheDocument();
  });

  it('handles malformed successful responses without crashing the UI', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as any
    );

    render(<InvoiceSettingsModal isOpen onClose={mockOnClose} />);

    expect(
      await screen.findByText('Failed to load invoice settings')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument();
  });

  it('does not show load failure for an aborted request', async () => {
    mockApiFetch.mockRejectedValueOnce(
      new DOMException('Request aborted', 'AbortError')
    );

    render(<InvoiceSettingsModal isOpen onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.queryByText('Failed to load invoice settings')
      ).not.toBeInTheDocument();
    });
    expect(mockHandleError).not.toHaveBeenCalled();
  });
});
