'use client';

import { useSidebarState } from '@/hooks/useSidebarState';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  headerActions?: React.ReactNode;
}

export default function AppLayout({
  title,
  children,
  actionButton,
  headerActions = null,
}: AppLayoutProps) {
  const { isExpanded, toggleSidebar, collapseSidebar } = useSidebarState();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const router = useRouter();

  // ✅ FIXED: matchMedia 훅으로 변경 (리렌더/이벤트 줄이기)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    handler(); // 초기값 설정
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ✅ FIXED: 모바일 사이드바 열렸을 때 body scroll lock
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isExpanded ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isExpanded]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile && isExpanded) {
      collapseSidebar();
    }
  }, [pathname, isMobile, isExpanded, collapseSidebar]);

  // ✅ FIXED: redirect는 AppLayout에서만 처리 (AuthProvider는 상태만 관리)
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!user) {
    return null;
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
        {/* ✅ FIXED: Mobile Overlay를 button으로 처리 (접근성 개선) */}
        {isMobile && isExpanded && (
          <button
            type="button"
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={collapseSidebar}
            aria-label="Close sidebar overlay"
          />
        )}

        {/* Sidebar */}
        <div
          className={`flex-shrink-0 transition-all duration-300 ease-in-out z-50 ${
            isMobile
              ? `fixed inset-y-0 left-0 ${
                  isExpanded ? 'translate-x-0' : '-translate-x-full'
                }`
              : ''
          }`}
        >
          <AppSidebar isExpanded={isExpanded} currentPath={pathname} />
        </div>

        {/* Main Content */}
        <div
          className={`flex-1 overflow-auto transition-all duration-300 ease-in-out ${
            isMobile && isExpanded ? 'lg:ml-0' : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
