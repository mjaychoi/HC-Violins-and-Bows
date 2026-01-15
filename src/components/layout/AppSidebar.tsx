'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AppSidebarProps {
  isExpanded: boolean;
  // onToggle: () => void
  currentPath: string;
}

export default function AppSidebar({
  isExpanded,
  currentPath,
}: AppSidebarProps) {
  // ✅ FIXED: hydration mismatch 해결 방식 단순화 - mounted 이후에만 isExpanded 반영
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const expanded = mounted ? isExpanded : false;
  const navigationItems = [
    {
      href: '/dashboard',
      label: 'Items',
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      ),
    },
    {
      href: '/clients',
      label: 'Clients',
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      href: '/calendar',
      label: 'Calendar',
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      href: '/invoices',
      label: 'Invoices',
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 3h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
            clipRule="evenodd"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 3v5h5"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 11h6M9 15h6"
          />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={`bg-white shadow-lg transition-all duration-300 ease-in-out h-full ${
        expanded ? 'w-64' : 'w-16'
      } overflow-hidden`}
    >
      <div className="p-4">
        {expanded && (
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <span className="ml-3 text-lg font-semibold text-gray-900">
              Inventory App
            </span>
          </div>
        )}

        <nav className="space-y-1">
          {navigationItems.map(item => {
            // Check if current path matches the href exactly
            // For sub-routes, we need exact match to avoid multiple active states
            // Exception: /clients should be active for /clients/analytics and /clients?tab=analytics
            const isActive =
              currentPath === item.href ||
              (item.href === '/clients' &&
                (currentPath.startsWith('/clients/') ||
                  currentPath.startsWith('/clients?')));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`py-3 cursor-pointer transition-all duration-300 ${
                  expanded ? 'px-6 justify-start' : 'px-4 justify-center'
                } flex items-center ${
                  isActive
                    ? 'bg-blue-50 border-r-2 border-blue-500'
                    : 'hover:bg-gray-50'
                }`}
                title={!expanded ? item.label : undefined}
              >
                <div
                  className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-600'}`}
                >
                  {item.icon}
                </div>
                {expanded && (
                  <span
                    className={`ml-3 ${
                      isActive ? 'text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
