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
    const mockShowSuccessBase = jest.fn();

    (useErrorHandler as jest.Mock).mockReturnValue({
      handleError: mockHandleError,
    });

    (useToast as jest.Mock).mockReturnValue({
      showSuccess: mockShowSuccessBase,
    });

    const { result } = renderHook(() => useAppFeedback());

    expect(result.current.handleError).toBe(mockHandleError);
    // showSuccess is a wrapper function, so we test that it calls the base function
    expect(result.current.showSuccess).toBeInstanceOf(Function);

    // Test that the wrapper calls the base function
    result.current.showSuccess('Test message');
    expect(mockShowSuccessBase).toHaveBeenCalledWith('Test message', undefined);

    // Test with links parameter
    const testLinks = [{ label: 'Test', href: '/test' }];
    result.current.showSuccess('Test message with links', testLinks);
    expect(mockShowSuccessBase).toHaveBeenCalledWith(
      'Test message with links',
      testLinks
    );
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
