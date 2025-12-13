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
export default function SuccessToasts({ toasts, onRemove }: SuccessToastsProps): React.JSX.Element {
  return React.createElement(
    'div',
    { className: 'fixed top-4 right-4 z-50 space-y-2' },
    toasts.map(toast =>
      React.createElement(SuccessToast, {
        key: toast.id,
        message: toast.message,
        onClose: () => onRemove(toast.id),
      })
    )
  );
}
