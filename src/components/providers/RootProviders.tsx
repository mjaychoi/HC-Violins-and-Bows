'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common';
import {
  ClientsProvider,
} from '@/contexts/ClientsContext';
import {
  InstrumentsProvider,
} from '@/contexts/InstrumentsContext';
import {
  ConnectionsProvider,
} from '@/contexts/ConnectionsContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataInitializer } from '@/components/providers/DataInitializer';
import { ToastProvider } from '@/contexts/ToastContext';

// ✅ FIXED: ToastProvider를 먼저 배치 (Context들이 useErrorHandler에서 useToastContext 사용)
// ✅ FIXED: Context 세분화로 불필요한 리렌더링 감소
// ✅ FIXED: default export로 변경하여 Webpack 모듈 로딩 문제 해결
export default function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <ClientsProvider>
            <InstrumentsProvider>
              <ConnectionsProvider>
                <DataInitializer>{children}</DataInitializer>
              </ConnectionsProvider>
            </InstrumentsProvider>
          </ClientsProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
