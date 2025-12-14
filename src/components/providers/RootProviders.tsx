'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common';
import { DataProvider } from '@/contexts/DataContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataInitializer } from '@/components/providers/DataInitializer';
import { ToastProvider } from '@/contexts/ToastContext';

// ✅ FIXED: ToastProvider를 DataProvider보다 먼저 배치 (DataProvider가 useErrorHandler에서 useToastContext 사용)
// ✅ FIXED: default export로 변경하여 Webpack 모듈 로딩 문제 해결
export default function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <DataProvider>
            <DataInitializer>{children}</DataInitializer>
          </DataProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
