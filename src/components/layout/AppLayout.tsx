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

  // 모바일에서도 사이드바가 닫힌 상태로 항상 보이도록 설정 (사라지지 않게)
  // 사이드바는 닫힌 상태(isExpanded=false)로 유지되지만 항상 표시됨
  useEffect(() => {
    if (isMobile && isExpanded) {
      collapseSidebar(); // 모바일에서 사이드바를 닫힌 상태로 유지
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // ✅ FIXED: redirect는 AppLayout에서만 처리 (단일 책임 원칙)
  // ProtectedRoute와 중복 방지: AppLayout이 모든 보호된 페이지의 인증 체크를 담당
  useEffect(() => {
    if (!loading && !user) {
      // ✅ FIXED: Use replace() instead of push() to prevent history stack issues
      // ✅ FIXED: Preserve destination page via next query parameter
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/?next=${next}`);
    }
  }, [user, loading, router, pathname]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // ✅ FIXED: Show "Redirecting..." UI instead of null to prevent blank screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Redirecting...</div>
      </div>
    );
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
