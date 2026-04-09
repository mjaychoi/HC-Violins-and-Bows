/**
 * TestProviders — shared provider wrapper for all Jest/RTL tests.
 *
 * Provider ordering matters. Outer providers must satisfy the dependencies
 * of inner providers. Current dependency graph:
 *
 *   TestAuthProvider          ← satisfies useAuth() called by useTenantIdentity()
 *     ToastProvider           ← satisfies useErrorHandler() called by data providers
 *       ClientsProvider       ← depends on useTenantIdentity → useAuth
 *       InstrumentsProvider   ← depends on useTenantIdentity → useAuth
 *       ConnectionsProvider   ← depends on useTenantIdentity → useAuth
 *
 * When adding a new provider that depends on another context, always add it
 * INSIDE the provider it depends on. Update this comment to keep the graph current.
 */
import React from 'react';
import { ToastProvider } from '@/contexts/ToastContext';
import { ClientsProvider } from '@/contexts/ClientsContext';
import { InstrumentsProvider } from '@/contexts/InstrumentsContext';
import { ConnectionsProvider } from '@/contexts/ConnectionsContext';
import { TestAuthProvider } from './TestAuthProvider';

export { TestAuthProvider } from './TestAuthProvider';

export function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <TestAuthProvider>
      <ToastProvider disableHost>
        <ClientsProvider>
          <InstrumentsProvider>
            <ConnectionsProvider>{children}</ConnectionsProvider>
          </InstrumentsProvider>
        </ClientsProvider>
      </ToastProvider>
    </TestAuthProvider>
  );
}
