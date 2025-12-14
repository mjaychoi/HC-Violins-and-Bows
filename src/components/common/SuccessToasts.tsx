'use client';

import React from 'react';
import SuccessToast from './SuccessToast';

interface Toast {
  id: string;
  message: string;
  timestamp: Date;
}

interface SuccessToastsProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

/**
 * Success toasts container component
 * Extracted from useToast hook for better React DevTools visibility and render tracking
 */
export default function SuccessToasts({
  toasts,
  onRemove,
}: SuccessToastsProps): React.JSX.Element {
  // ✅ FIXED: onClose 안정화 - 부모가 매 렌더마다 새 함수 만들면 자식 effect가 다시 도는 문제 방지
  const handleRemove = React.useCallback(
    (id: string) => onRemove(id),
    [onRemove]
  );

  return React.createElement(
    'div',
    {
      className: 'fixed top-4 right-4 z-50 space-y-2',
      // ✅ FIXED: 모바일 safe-area 고려
      style: {
        paddingTop: 'env(safe-area-inset-top, 1rem)',
        paddingRight: 'env(safe-area-inset-right, 1rem)',
      },
    },
    toasts.map(toast =>
      React.createElement(SuccessToast, {
        key: toast.id,
        message: toast.message,
        onClose: () => handleRemove(toast.id),
      })
    )
  );
}
