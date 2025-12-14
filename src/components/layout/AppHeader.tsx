'use client';

import { useAuth } from '@/contexts/AuthContext';

interface AppHeaderProps {
  title: string;
  onToggleSidebar: () => void;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  headerActions?: React.ReactNode;
}

export default function AppHeader({
  title,
  onToggleSidebar,
  actionButton,
  headerActions,
}: AppHeaderProps) {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="bg-white shadow-sm border-b">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* ✅ FIXED: 토글 버튼을 w-16 슬롯 안에 넣고 가운데 정렬 (calc 해킹 제거) */}
          <div className="flex items-center min-w-0">
            {/* Sidebar toggle slot: always 64px wide */}
            <div className="w-16 flex items-center justify-center">
              <button
                onClick={onToggleSidebar}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Toggle sidebar"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
            <h1 className="ml-2 sm:ml-4 text-xl sm:text-2xl font-semibold text-gray-900 truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {headerActions && (
              <div className="hidden sm:flex items-center">{headerActions}</div>
            )}

            {user && (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <span className="text-xs sm:text-sm text-gray-600 hidden md:inline truncate max-w-[120px] lg:max-w-none">
                  {user.email}
                </span>
                {/* ✅ FIXED: SignOut 스타일 개선 */}
                <button
                  onClick={handleSignOut}
                  className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 px-2 sm:px-3 py-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                  aria-label="Sign out"
                >
                  Sign out
                </button>
              </div>
            )}

            {actionButton && (
              <button
                onClick={actionButton.onClick}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={actionButton.label}
              >
                <span className="h-4 w-4 flex shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                  {actionButton.icon || (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )}
                </span>
                <span className="hidden sm:inline">{actionButton.label}</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
