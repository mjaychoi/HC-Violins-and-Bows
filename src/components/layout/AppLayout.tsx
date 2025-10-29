'use client';

import { useSidebarState } from '@/hooks/useSidebarState';
import { usePathname } from 'next/navigation';
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
}

export default function AppLayout({
  title,
  children,
  actionButton,
}: AppLayoutProps) {
  const { isExpanded, toggleSidebar } = useSidebarState();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader
        title={title}
        onToggleSidebar={toggleSidebar}
        actionButton={actionButton}
      />

      <div className="flex">
        {/* Sidebar */}
        <AppSidebar isExpanded={isExpanded} currentPath={pathname} />

        {/* Main Content */}
        <div className={`flex-1 transition-all duration-300 ease-in-out`}>
          {children}
        </div>
      </div>
    </div>
  );
}
