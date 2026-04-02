'use client';

import { useSidebarState } from '@/hooks/useSidebarState';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import AppHeader, { type AppHeaderActionButton } from './AppHeader';
import AppSidebar from './AppSidebar';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
  actionButton?: AppHeaderActionButton;
  headerActions?: React.ReactNode;
}

export default function AppLayout({
  title,
  children,
  actionButton,
  headerActions = null,
}: AppLayoutProps) {
  const { isExpanded, toggleSidebar } = useSidebarState();
  const pathname = usePathname();
  const { user, loading, hasOrgContext } = useAuth();
  const router = useRouter();

  const redirectTarget = useMemo(() => {
    if (loading) return null;
    if (!user) {
      const next = encodeURIComponent(pathname || '/');
      return `/?next=${next}`;
    }
    if (!hasOrgContext) {
      const next = encodeURIComponent(pathname || '/dashboard');
      return `/onboarding/organization?next=${next}`;
    }
    return null;
  }, [hasOrgContext, loading, pathname, user]);

  useEffect(() => {
    if (redirectTarget) {
      router.replace(redirectTarget);
    }
  }, [redirectTarget, router]);

  const renderBlockingShell = (message: string) => (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-start gap-6 px-6 py-8">
        <div className="hidden w-64 shrink-0 rounded-2xl border border-gray-200 bg-white p-4 lg:block">
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
            <div className="space-y-2">
              <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
          </div>
          <div className="px-6 py-10">
            <div className="max-w-md space-y-4">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
            </div>
            <p className="mt-8 text-sm text-gray-500">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return renderBlockingShell('Checking your session...');
  }

  if (redirectTarget) {
    return renderBlockingShell('Redirecting you to the right place...');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <AppHeader
        title={title}
        onToggleSidebar={toggleSidebar}
        actionButton={actionButton}
        headerActions={headerActions}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - 모바일에서도 닫힌 상태로 항상 표시 (사라지지 않게) */}
        <div className="flex-shrink-0 transition-all duration-300 ease-in-out z-50">
          <AppSidebar isExpanded={isExpanded} currentPath={pathname} />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto pb-8">{children}</div>
      </div>
    </div>
  );
}
