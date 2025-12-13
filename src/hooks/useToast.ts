'use client';
import { useState, useCallback, useMemo } from 'react';
import React from 'react';
import SuccessToastsComponent from '@/components/common/SuccessToasts';

interface Toast {
  id: string;
  message: string;
  timestamp: Date;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showSuccess = useCallback((message: string) => {
    const toast: Toast = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      timestamp: new Date(),
    };
    setToasts(prev => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Memoize SuccessToasts component to prevent re-creation on every render
  // This ensures stable component identity for React DevTools and prevents unnecessary re-renders
  const SuccessToasts = useMemo(
    () =>
      React.createElement(SuccessToastsComponent, {
        toasts,
        onRemove: removeToast,
      }),
    [toasts, removeToast]
  );

  return {
    showSuccess,
    removeToast,
    // Return memoized component for stable identity
    SuccessToasts: () => SuccessToasts,
  };
}
