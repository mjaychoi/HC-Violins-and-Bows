'use client';

import React from 'react';

export interface EmptyStateProps {
  /** 제목 */
  title?: string;
  /** 설명 */
  description?: string;
  /** 아이콘 (선택사항, 기본 아이콘 사용) */
  icon?: React.ReactNode;
  /** 액션 버튼 (선택사항) */
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  /** 필터가 활성화되어 있는지 여부 */
  hasActiveFilters?: boolean;
  /** 필터 초기화 핸들러 (hasActiveFilters가 true일 때 사용) */
  onResetFilters?: () => void;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * 공통 빈 상태 컴포넌트
 * 모든 페이지에서 일관된 빈 상태 UI를 제공합니다.
 */
export default function EmptyState({
  title,
  description,
  icon,
  actionButton,
  hasActiveFilters = false,
  onResetFilters,
  className = '',
}: EmptyStateProps) {
  const defaultIcon = (
    <svg
      className="mx-auto h-16 w-16 text-gray-300"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );

  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}
    >
      <div className="text-center py-16 px-4" role="status" aria-live="polite">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
          {icon || defaultIcon}
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">
          {title ||
            (hasActiveFilters
              ? 'No items found matching your filters'
              : 'No items yet')}
        </h3>
        <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
          {description ||
            (hasActiveFilters
              ? 'Try adjusting your filters or clearing them to see all items.'
              : 'Add your first item to get started.')}
        </p>
        {(actionButton || (hasActiveFilters && onResetFilters)) && (
          <div className="mt-8 flex items-center justify-center gap-3">
            {hasActiveFilters && onResetFilters && (
              <button
                onClick={onResetFilters}
                className="inline-flex items-center px-4 py-2.5 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Clear filters
              </button>
            )}
            {actionButton && (
              <button
                onClick={actionButton.onClick}
                className="inline-flex items-center px-5 py-2.5 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                {actionButton.icon && (
                  <span className="mr-2">{actionButton.icon}</span>
                )}
                {actionButton.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
