import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoiceSettingsModal from '../InvoiceSettingsModal';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';

jest.mock('@/utils/apiFetch');
jest.mock('@/hooks/useAppFeedback');
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
});
