'use client';

import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Loading / empty shell for protected UI trees.
 *
 * Auth redirects are owned by:
 * 1. `src/middleware.ts` (Edge, primary)
 * 2. `AppLayout` (client fail-closed fallback for missing session / missing org)
 *
 * Do not pair this with AppLayout when both would render conflicting shells.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show redirecting UI if not authenticated (redirect is handled by AppLayout or parent)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Redirecting...</div>
      </div>
    );
  }

  return <>{children}</>;
}
