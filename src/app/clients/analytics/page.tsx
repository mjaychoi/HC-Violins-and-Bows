'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to /clients with analytics tab
export default function ClientAnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to /clients?tab=analytics
    router.replace('/clients?tab=analytics');
  }, [router]);

  return null;
}
