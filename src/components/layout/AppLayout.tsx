'use client';

import { useSidebarState } from '@/hooks/useSidebarState';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppHeader, { type AppHeaderActionButton } from './AppHeader';
import AppSidebar from './AppSidebar';
import {
  buildLoginRedirect,
  buildOnboardingRedirect,
} from '@/utils/authRedirect';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
  actionButton?: AppHeaderActionButton;
  headerActions?: React.ReactNode;
  hideSidebar?: boolean;
}

const MOBILE_NAVIGATION_ID = 'app-mobile-navigation';

export default function AppLayout({
  title,
  children,
  actionButton,
  headerActions = null,
  hideSidebar = false,
}: AppLayoutProps) {
  const { isExpanded: desktopExpanded, toggleSidebar: toggleDesktopSidebar } =
    useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { user, loading, hasOrgContext } = useAuth();
  const { isTenantTransitioning } = useTenantIdentity();
  const router = useRouter();

  const closeMobileNavigation = useCallback((restoreFocus = true) => {
    setMobileOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => mobileToggleRef.current?.focus(), 0);
    }
  }, []);

  const toggleMobileNavigation = useCallback(() => {
    setMobileOpen(open => {
      if (open) {
        window.setTimeout(() => mobileToggleRef.current?.focus(), 0);
      }
      return !open;
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const drawer = document.getElementById(MOBILE_NAVIGATION_ID);
      drawer
        ?.querySelector<HTMLAnchorElement>('a[aria-current="page"], a')
        ?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileNavigation();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [closeMobileNavigation, mobileOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleDesktopResize = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobileNavigation(false);
    };
    desktopQuery.addEventListener('change', handleDesktopResize);
    return () =>
      desktopQuery.removeEventListener('change', handleDesktopResize);
  }, [closeMobileNavigation]);

  // Fail-closed client fallback when page middleware is bypassed or session
  // is cleared after hydration. Edge middleware remains the primary gate.
  const loginRedirectTarget = useMemo(() => {
    if (loading || user) return null;
    return buildLoginRedirect(pathname || '/dashboard');
  }, [loading, pathname, user]);

  const orgRedirectTarget = useMemo(() => {
    if (loading || !user || hasOrgContext) return null;
    return buildOnboardingRedirect(pathname || '/dashboard');
  }, [hasOrgContext, loading, pathname, user]);

  useEffect(() => {
    if (loginRedirectTarget) {
      router.replace(loginRedirectTarget);
      return;
    }
    if (orgRedirectTarget) {
      router.replace(orgRedirectTarget);
    }
  }, [loginRedirectTarget, orgRedirectTarget, router]);

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

  if (isTenantTransitioning) {
    return renderBlockingShell('Refreshing your workspace...');
  }

  if (loginRedirectTarget || !user) {
    return renderBlockingShell('Redirecting to sign in...');
  }

  if (orgRedirectTarget) {
    return renderBlockingShell('Redirecting you to organization setup...');
  }

  return (
    <div className="flex h-dvh min-h-screen flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <AppHeader
        title={title}
        onToggleSidebar={toggleDesktopSidebar}
        onToggleMobileNavigation={toggleMobileNavigation}
        isMobileNavigationOpen={mobileOpen}
        mobileNavigationId={MOBILE_NAVIGATION_ID}
        mobileToggleRef={mobileToggleRef}
        hideSidebarToggle={hideSidebar}
        actionButton={actionButton}
        headerActions={headerActions}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar remains in normal flow at lg and above. */}
        {!hideSidebar && (
          <div
            className="z-40 hidden flex-shrink-0 transition-all duration-300 ease-in-out lg:block"
            data-testid="desktop-sidebar"
          >
            <AppSidebar
              id="app-desktop-sidebar"
              isExpanded={desktopExpanded}
              currentPath={pathname}
            />
          </div>
        )}

        {!hideSidebar && mobileOpen && (
          <div
            className="absolute inset-0 z-50 lg:hidden"
            data-testid="mobile-navigation-overlay"
          >
            <div
              className="absolute inset-0 bg-gray-900/40"
              data-testid="mobile-navigation-backdrop"
              aria-hidden="true"
              onClick={() => closeMobileNavigation()}
            />
            <div className="absolute inset-y-0 left-0">
              <AppSidebar
                id={MOBILE_NAVIGATION_ID}
                variant="mobile"
                isExpanded
                currentPath={pathname}
                onNavigate={() => closeMobileNavigation(false)}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <main
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-8"
          data-testid="app-main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
