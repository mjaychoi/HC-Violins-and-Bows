import React from 'react';

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Sidebar({
  isExpanded,
  onToggle,
  children,
  className = '',
}: SidebarProps) {
  return (
    <div
      className={`${isExpanded ? 'w-64' : 'w-16'} transition-all duration-300 ${className}`}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="w-full p-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-b border-gray-200"
      >
        <div className="flex items-center justify-center">
          <svg
            className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </button>

      {/* Sidebar Content */}
      <div className={`${isExpanded ? 'block' : 'hidden'} p-4`}>{children}</div>
    </div>
  );
}
