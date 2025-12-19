import { useErrorHandler, useToast } from '@/contexts/ToastContext';
import type { ToastLink } from '@/contexts/ToastContext';

/**
 * Combines error handling and success toasts into a single hook
 * to avoid repeating the same wiring on each page.
 * ✅ FIXED: ToastHost는 ToastProvider에서 자동 렌더링되므로 ErrorToasts/SuccessToasts는 더 이상 필요 없음
 */
export function useAppFeedback() {
  const { handleError } = useErrorHandler();
  const { showSuccess: showSuccessBase } = useToast();

  // Wrapper to maintain backward compatibility
  const showSuccess = (message: string, links?: ToastLink[]) => {
    showSuccessBase(message, links);
  };

  return {
    handleError,
    showSuccess,
  };
}
