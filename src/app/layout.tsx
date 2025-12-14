import './globals.css';
import { ReactNode } from 'react';
import RootProviders from '@/components/providers/RootProviders';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
