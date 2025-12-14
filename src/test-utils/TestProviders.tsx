/**
 * ✅ FIXED: 테스트용 Provider 통일
 * 모든 테스트에서 일관된 Provider 환경 제공
 * disableHost로 ToastHost 렌더링 비활성화 (테스트 안정성 향상)
 * Context 세분화 후: ClientsProvider, InstrumentsProvider, ConnectionsProvider 추가
 */
import React from 'react';
import { ToastProvider } from '@/contexts/ToastContext';
import { ClientsProvider } from '@/contexts/ClientsContext';
import { InstrumentsProvider } from '@/contexts/InstrumentsContext';
import { ConnectionsProvider } from '@/contexts/ConnectionsContext';

export function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider disableHost>
      <ClientsProvider>
        <InstrumentsProvider>
          <ConnectionsProvider>{children}</ConnectionsProvider>
        </InstrumentsProvider>
      </ClientsProvider>
    </ToastProvider>
  );
}
