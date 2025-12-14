'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * @deprecated This page has been integrated into /clients?tab=analytics
 * This page redirects to the new location for backward compatibility
 */
export default function ClientAnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/clients?tab=analytics');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">Redirecting to Client Analytics...</div>
    </div>
  );
}
