'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ClientsProvider } from '@/contexts/ClientsContext';
import { InstrumentsProvider } from '@/contexts/InstrumentsContext';
import { ConnectionsProvider } from '@/contexts/ConnectionsContext';
import { DataInitializer } from '@/components/providers/DataInitializer';

// ✅ FIXED: ToastProvider를 먼저 배치 (Context들이 useErrorHandler에서 useToastContext 사용)
// ✅ FIXED: Context 세분화로 불필요한 리렌더링 감소
// ✅ FIXED: Import order optimized to avoid webpack module loading issues
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
