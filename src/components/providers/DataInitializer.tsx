'use client';

import { ReactNode } from 'react';
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
  // FIXED: Call useUnifiedData only once at the root level
  // This ensures data is fetched once per session, not on every page mount
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    logInfo('[DataInitializer] Mounting - will call useUnifiedData');
  }
  useUnifiedData();
  return <>{children}</>;
}
