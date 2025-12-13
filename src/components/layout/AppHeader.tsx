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
          <div className="flex items-center">
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ marginLeft: 'calc(64px / 2 - 20px)' }}
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
            <h1 className="ml-2 sm:ml-4 text-xl sm:text-2xl font-semibold text-gray-900 truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {headerActions && (
              <div className="flex items-center hidden sm:flex">{headerActions}</div>
            )}
            
            {user && (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <span className="text-xs sm:text-sm text-gray-600 hidden md:inline truncate max-w-[120px] lg:max-w-none">
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 px-2 sm:px-3 py-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                  aria-label="Sign out"
                >
                  SignOut
                </button>
              </div>
            )}

            {actionButton && (
              <button
                onClick={actionButton.onClick}
                className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
              >
                {actionButton.icon}
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
