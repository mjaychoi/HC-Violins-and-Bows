import React from 'react';
import { AppError } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';

interface ErrorToastProps {
  error: AppError;
  onClose: () => void;
  autoClose?: boolean;
  showRecoverySuggestions?: boolean;
  onRetry?: () => void;
}

export default function ErrorToast({
  error,
  onClose,
  autoClose = true,
  showRecoverySuggestions = true,
  onRetry,
}: ErrorToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Allow fade out animation
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  if (!isVisible) return null;

  const getErrorIcon = (code: string) => {
    switch (code) {
      case 'NETWORK_ERROR':
      case 'TIMEOUT_ERROR':
        return '🌐';
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        return '🔒';
      case 'DATABASE_ERROR':
        return '🗄️';
      case 'VALIDATION_ERROR':
        return '⚠️';
      default:
        return '❌';
    }
  };

  const getErrorColor = (code: string) => {
    switch (code) {
      case 'NETWORK_ERROR':
      case 'TIMEOUT_ERROR':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'DATABASE_ERROR':
        return 'bg-purple-50 border-purple-200 text-purple-800';
      case 'VALIDATION_ERROR':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const friendlyMessage = errorHandler.getUserFriendlyMessage(error);
  const recoverySuggestions = showRecoverySuggestions
    ? errorHandler.getRecoverySuggestions(error)
    : [];

  return (
    <div
      className={`max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto border-l-4 overflow-hidden ${getErrorColor(error.code)}`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-lg">{getErrorIcon(error.code)}</span>
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium">{friendlyMessage}</p>
            {error.details && (
              <p className="mt-1 text-sm opacity-75">{error.details}</p>
            )}

            {recoverySuggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium mb-1">Solution methods:</p>
                <ul className="text-xs space-y-1">
                  {recoverySuggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-1">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            {onRetry && (
              <button
                onClick={onRetry}
                className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-2"
              >
                <span className="sr-only">Retry</span>
                🔄
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
