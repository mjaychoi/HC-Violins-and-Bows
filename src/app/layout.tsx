import './globals.css'
import { ReactNode } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  )
}
