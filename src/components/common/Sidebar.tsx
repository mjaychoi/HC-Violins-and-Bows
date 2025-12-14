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
      {/* ✅ FIXED: DOM은 유지하되 opacity-0 pointer-events-none으로 처리 (내부 상태 유지, 애니메이션 부드럽게) */}
      <div
        className={`p-4 transition-all duration-300 ${
          isExpanded
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
