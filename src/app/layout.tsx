import './globals.css';
import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common';
import { DataProvider } from '@/contexts/DataContext';
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <DataProvider>{children}</DataProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
