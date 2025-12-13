import { useErrorHandler } from './useErrorHandler';
import { useToast } from './useToast';

/**
 * Combines error handling and success toasts into a single hook
 * to avoid repeating the same wiring on each page.
 */
export function useAppFeedback() {
  const { ErrorToasts, handleError } = useErrorHandler();
  const { SuccessToasts, showSuccess } = useToast();

  return {
    ErrorToasts,
    SuccessToasts,
    handleError,
    showSuccess,
  };
}
