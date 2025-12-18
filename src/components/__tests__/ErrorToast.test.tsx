import { render, screen, fireEvent, waitFor, act } from '@/test-utils/render';
import { AppError, ErrorCodes } from '@/types/errors';

// ✅ FIXED: ErrorToast는 실제 컴포넌트를 테스트해야 하므로 전역 mock 해제
// jest.unmock은 jest.mock보다 먼저 호출되어야 함
jest.unmock('@/components/ErrorToast');
import ErrorToast from '../ErrorToast';

// Mock the errorHandler
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    getUserFriendlyMessage: jest.fn(error => `Friendly: ${error.message}`),
    getRecoverySuggestions: jest.fn(() => [
      'Check your connection',
      'Try again later',
    ]),
  },
}));

describe('ErrorToast', () => {
  const mockError: AppError = {
    code: ErrorCodes.NETWORK_ERROR,
    message: 'Network connection failed',
    timestamp: new Date().toISOString(),
    context: { endpoint: '/api/test' },
  };

  const defaultProps = {
    error: mockError,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render error message', () => {
    render(<ErrorToast {...defaultProps} />);

    expect(
      screen.getByText('Friendly: Network connection failed')
    ).toBeInTheDocument();
  });

  it('should render error details when provided', () => {
    const errorWithDetails = {
      ...mockError,
      details: 'Connection timeout after 30 seconds',
    };

    render(<ErrorToast {...defaultProps} error={errorWithDetails} />);

    expect(
      screen.getByText('Connection timeout after 30 seconds')
    ).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<ErrorToast {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should auto-close after duration', async () => {
    jest.useFakeTimers();

    render(<ErrorToast {...defaultProps} />);

    expect(
      screen.getByText('Friendly: Network connection failed')
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000); // Wait for autoClose duration
    });

    act(() => {
      jest.advanceTimersByTime(300); // Wait for fade out
    });

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  it('should not auto-close when autoClose is false', async () => {
    jest.useFakeTimers();

    render(<ErrorToast {...defaultProps} autoClose={false} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(defaultProps.onClose).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('should show recovery suggestions when enabled', () => {
    render(<ErrorToast {...defaultProps} showRecoverySuggestions={true} />);

    expect(screen.getByText(/해결 방법:/)).toBeInTheDocument();
    expect(screen.getByText('Check your connection')).toBeInTheDocument();
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });

  it('should show retry button for retryable errors', () => {
    const onRetry = jest.fn();
    render(<ErrorToast {...defaultProps} onRetry={onRetry} />);

    const retryButton = screen.getByText('🔄');
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalled();
  });

  it('should not show retry button for non-retryable errors', () => {
    const validationError = {
      ...mockError,
      code: ErrorCodes.VALIDATION_ERROR,
    };

    const onRetry = jest.fn();
    render(
      <ErrorToast {...defaultProps} error={validationError} onRetry={onRetry} />
    );

    expect(screen.queryByTitle('Retry')).not.toBeInTheDocument();
  });

  it('should apply correct styling for different error types', () => {
    const { container } = render(<ErrorToast {...defaultProps} />);

    // Network error should have yellow styling - the root div has the bg class
    const rootDiv = container.firstChild;
    expect(rootDiv).toHaveClass('bg-yellow-50');
  });

  it('should not render recovery suggestions when disabled', () => {
    render(<ErrorToast {...defaultProps} showRecoverySuggestions={false} />);

    expect(screen.queryByText(/해결 방법:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Check your connection')).not.toBeInTheDocument();
    expect(screen.queryByText('Try again later')).not.toBeInTheDocument();
  });

  it('should handle multiple error types correctly', () => {
    const errorTypes = [
      { code: ErrorCodes.NETWORK_ERROR, expectedClass: 'bg-yellow-50' },
      { code: ErrorCodes.UNAUTHORIZED, expectedClass: 'bg-red-50' },
      { code: ErrorCodes.VALIDATION_ERROR, expectedClass: 'bg-orange-50' },
      { code: ErrorCodes.UNKNOWN_ERROR, expectedClass: 'bg-gray-50' },
    ];

    errorTypes.forEach(({ code, expectedClass }) => {
      const error = { ...mockError, code, message: `Test ${code}` };
      const { container, unmount } = render(
        <ErrorToast {...defaultProps} error={error} />
      );

      // Root div has the background color class
      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv).toHaveClass(expectedClass);
      unmount();
    });
  });
});
