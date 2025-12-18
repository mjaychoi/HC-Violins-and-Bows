'use client';

import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ✅ FIXED: Protected route component - redirect logic removed to prevent duplication
 *
 * ⚠️ IMPORTANT: Redirect logic has been moved to AppLayout to prevent duplicate redirects
 * This component now only provides loading/redirecting UI states
 *
 * All protected pages use AppLayout, which handles authentication redirects centrally.
 * If you need a standalone protected route wrapper (without AppLayout), use this component,
 * but be aware that AppLayout also performs redirects, so don't use both together.
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
