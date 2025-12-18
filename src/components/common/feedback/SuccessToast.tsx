import React from 'react';
import Link from 'next/link';
import type { ToastLink } from '@/contexts/ToastContext';

interface SuccessToastProps {
  message: string;
  onClose: () => void;
  autoClose?: boolean;
  links?: ToastLink[];
}

export default function SuccessToast({
  message,
  onClose,
  autoClose = true,
  links,
}: SuccessToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);
  // ✅ FIXED: "한 번만 close" 보장하는 guard
  const closedRef = React.useRef(false);

  const requestClose = React.useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setIsVisible(false);
    window.setTimeout(onClose, 300);
  }, [onClose]);

  React.useEffect(() => {
    if (!autoClose) return;
    const timer = window.setTimeout(requestClose, 3000);
    return () => window.clearTimeout(timer);
  }, [autoClose, requestClose]);

  if (!isVisible) return null;

  return (
    <div className="max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto border-l-4 border-emerald-500 overflow-hidden animate-in slide-in-from-right">
      <div className="p-4 flex items-start">
        <div className="shrink-0">
          <svg
            className="h-5 w-5 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
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
          onClick={requestClose}
          className="ml-4 shrink-0 inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
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
