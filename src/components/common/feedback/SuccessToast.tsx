import React from 'react';
import Link from 'next/link';
import type { ToastLink } from '@/contexts/ToastContext';
import type { ToastVariant } from '@/contexts/SuccessToastContext';

interface SuccessToastProps {
  message: string;
  onClose: () => void;
  autoClose?: boolean;
  links?: ToastLink[];
  variant?: ToastVariant;
}

export default function SuccessToast({
  message,
  onClose,
  autoClose = true,
  links,
  variant = 'success',
}: SuccessToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);
  const closeTimerRef = React.useRef<number | null>(null);
  const closedRef = React.useRef(false);

  const handleClose = React.useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setIsVisible(false);
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    if (!autoClose) return;
    const timer = window.setTimeout(handleClose, 5000);
    closeTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
    };
  }, [autoClose, handleClose]);

  if (!isVisible) return null;

  const variantStyles =
    variant === 'warning'
      ? {
          container: 'border-amber-500',
          icon: 'text-amber-600',
          focus: 'focus:ring-amber-500',
        }
      : {
          container: 'border-emerald-500',
          icon: 'text-emerald-600',
          focus: 'focus:ring-emerald-500',
        };

  return (
    <div
      className={`max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto border-l-4 overflow-hidden animate-in slide-in-from-right ${variantStyles.container}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="p-4 flex items-start">
        <div className="shrink-0">
          <svg
            className={`h-5 w-5 ${variantStyles.icon}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {variant === 'warning' ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.67 18h16.66a1 1 0 00.88-1.5l-7.5-13a1 1 0 00-1.74 0z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            )}
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-gray-900">{message}</p>
          {links && links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map((link, index) => (
                <Link
                  key={index}
                  href={link.href}
                  onClick={e => {
                    e.stopPropagation();
                    // 링크 클릭 시 토스트는 유지 (사용자가 페이지 이동 후에도 확인 가능)
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  {link.label} →
                </Link>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleClose}
          className={`ml-4 shrink-0 inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantStyles.focus}`}
          aria-label="Close"
        >
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
  );
}
