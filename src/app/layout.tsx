import './globals.css';
import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common';
import { DataProvider } from '@/contexts/DataContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataInitializer } from '@/components/providers/DataInitializer';

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <DataInitializer>{children}</DataInitializer>
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
