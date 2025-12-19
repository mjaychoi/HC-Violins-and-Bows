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

export interface Toast {
  id: string;
  message: string;
  timestamp: Date;
  links?: ToastLink[];
}

interface SuccessToastContextValue {
  toasts: Toast[];
  showSuccess: (message: string, links?: ToastLink[]) => void;
  removeToast: (id: string) => void;
}

const SuccessToastContext = createContext<SuccessToastContextValue | undefined>(
  undefined
);

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ✅ FIXED: useRef로 카운터를 관리하여 안정적인 ID 생성 (Math.random() 제거)
  const toastIdCounterRef = useRef(0);

  const showSuccess = useCallback((message: string, links?: ToastLink[]) => {
    const toast: Toast = {
      id: `toast-${Date.now()}-${++toastIdCounterRef.current}`,
      message,
      timestamp: new Date(),
      links,
    };
    setToasts(prev => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const value: SuccessToastContextValue = {
    toasts,
    showSuccess,
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
