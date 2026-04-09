'use client';

import { ReactNode, useEffect } from 'react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { logInfo } from '@/utils/logger';

/**
 * DataInitializer - Initializes data fetching at the root level
 *
 * This component ensures that useUnifiedData() is called only once at the root level,
 * preventing duplicate fetches when multiple pages mount/unmount.
 * React 18 Strict Mode causes components to mount/unmount/remount for testing,
 * and without this, each page would trigger a fetch on mount.
 */
export function DataInitializer({ children }: { children: ReactNode }) {
  // Log only on actual mount (useEffect), not on every render.
  // Logging in the render function body is a side-effect that React StrictMode
  // intentionally invokes twice, producing duplicate console entries.
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logInfo('DataInitializer mounted', 'DataInitializer');
    }
  }, []);

  useUnifiedData();
  return <>{children}</>;
}
