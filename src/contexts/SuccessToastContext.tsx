'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';

export interface ToastLink {
  label: string;
  href: string;
}

export type ToastVariant = 'success' | 'warning';

export interface Toast {
  id: string;
  message: string;
  timestamp: Date;
  links?: ToastLink[];
  variant: ToastVariant;
}

interface SuccessToastContextValue {
  toasts: Toast[];
  showSuccess: (message: string, links?: ToastLink[]) => void;
  showWarning: (message: string, links?: ToastLink[]) => void;
  removeToast: (id: string) => void;
}

const SuccessToastContext = createContext<SuccessToastContextValue | undefined>(
  undefined
);

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ✅ FIXED: useRef로 카운터를 관리하여 안정적인 ID 생성 (Math.random() 제거)
  const toastIdCounterRef = useRef(0);

  const showToast = useCallback(
    (variant: ToastVariant, message: string, links?: ToastLink[]) => {
      const toast: Toast = {
        id: `toast-${Date.now()}-${++toastIdCounterRef.current}`,
        message,
        timestamp: new Date(),
        links,
        variant,
      };
      setToasts(prev => [...prev, toast]);
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, links?: ToastLink[]) => {
      showToast('success', message, links);
    },
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, links?: ToastLink[]) => {
      showToast('warning', message, links);
    },
    [showToast]
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const value: SuccessToastContextValue = {
    toasts,
    showSuccess,
    showWarning,
    removeToast,
  };

  return (
    <SuccessToastContext.Provider value={value}>
      {children}
    </SuccessToastContext.Provider>
  );
}

export function useSuccessToastContext() {
  const context = useContext(SuccessToastContext);
  if (!context) {
    throw new Error(
      'useSuccessToastContext must be used within SuccessToastProvider'
    );
  }
  return context;
}
