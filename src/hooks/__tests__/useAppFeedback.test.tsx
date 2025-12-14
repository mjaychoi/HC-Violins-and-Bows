import { renderHook } from '@/test-utils/render';
import { useAppFeedback } from '../useAppFeedback';
import { useErrorHandler, useToast } from '@/contexts/ToastContext';

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: jest.fn(),
    useToast: jest.fn(),
  };
});

// Mock functions are now defined in jest.mock above

describe('useAppFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should combine error handler and toast hooks', () => {
    const mockHandleError = jest.fn();
    const mockShowSuccess = jest.fn();

    (useErrorHandler as jest.Mock).mockReturnValue({
      handleError: mockHandleError,
    });

    (useToast as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccess,
    });

    const { result } = renderHook(() => useAppFeedback());

    expect(result.current.handleError).toBe(mockHandleError);
    expect(result.current.showSuccess).toBe(mockShowSuccess);
  });

  it('should call useErrorHandler and useToast', () => {
    (useErrorHandler as jest.Mock).mockReturnValue({
      handleError: jest.fn(),
    });

    (useToast as jest.Mock).mockReturnValue({
      showSuccess: jest.fn(),
    });

    renderHook(() => useAppFeedback());

    expect(useErrorHandler).toHaveBeenCalled();
    expect(useToast).toHaveBeenCalled();
  });
});
