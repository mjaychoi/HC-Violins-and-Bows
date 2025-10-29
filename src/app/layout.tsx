import './globals.css';
import { ReactNode } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { DataProvider } from '@/contexts/DataContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <DataProvider>{children}</DataProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
