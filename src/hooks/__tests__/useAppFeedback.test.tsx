import { renderHook } from '@testing-library/react';
import { useAppFeedback } from '../useAppFeedback';
import { useErrorHandler } from '../useErrorHandler';
import { useToast } from '../useToast';

jest.mock('../useErrorHandler');
jest.mock('../useToast');

const mockUseErrorHandler = useErrorHandler as jest.MockedFunction<typeof useErrorHandler>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

describe('useAppFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should combine error handler and toast hooks', () => {
    const mockErrorToasts = jest.fn();
    const mockSuccessToasts = jest.fn();
    const mockHandleError = jest.fn();
    const mockShowSuccess = jest.fn();

    mockUseErrorHandler.mockReturnValue({
      ErrorToasts: mockErrorToasts,
      handleError: mockHandleError,
    } as unknown as ReturnType<typeof useErrorHandler>);

    mockUseToast.mockReturnValue({
      SuccessToasts: mockSuccessToasts,
      showSuccess: mockShowSuccess,
      removeToast: jest.fn(),
    });

    const { result } = renderHook(() => useAppFeedback());

    expect(result.current.ErrorToasts).toBe(mockErrorToasts);
    expect(result.current.SuccessToasts).toBe(mockSuccessToasts);
    expect(result.current.handleError).toBe(mockHandleError);
    expect(result.current.showSuccess).toBe(mockShowSuccess);
  });

  it('should call useErrorHandler and useToast', () => {
    mockUseErrorHandler.mockReturnValue({
      ErrorToasts: jest.fn(),
      handleError: jest.fn(),
    } as unknown as ReturnType<typeof useErrorHandler>);

    mockUseToast.mockReturnValue({
      SuccessToasts: jest.fn(),
      showSuccess: jest.fn(),
      removeToast: jest.fn(),
    });

    renderHook(() => useAppFeedback());

    expect(mockUseErrorHandler).toHaveBeenCalled();
    expect(mockUseToast).toHaveBeenCalled();
  });
});
