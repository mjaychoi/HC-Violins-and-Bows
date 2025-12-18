'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
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

  const showSuccess = useCallback((message: string, links?: ToastLink[]) => {
    const toast: Toast = {
      id: `${Date.now()}-${Math.random()}`,
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
