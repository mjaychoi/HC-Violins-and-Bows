'use client';

import React, { useState } from 'react';
import { GuideModal } from './GuideModal';

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
  /** 단계별 가이드 (선택사항) */
  guideSteps?: string[];
  /** 도움말 링크 (선택사항) */
  helpLink?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** 예시 데이터로 시작하기 (선택사항) */
  onLoadSampleData?: () => void;
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
  guideSteps,
  helpLink,
  onLoadSampleData,
}: EmptyStateProps) {
  const [showGuideModal, setShowGuideModal] = useState(false);

  // ✅ FIXED: defaultIcon 크기 조정 (wrapper가 size 담당)
  const defaultIcon = (
    <svg
      className="h-8 w-8 text-gray-300"
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
      data-testid="empty-state"
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

        {/* 단계별 가이드 */}
        {guideSteps && guideSteps.length > 0 && !hasActiveFilters && (
          <div className="mt-6 text-left max-w-md mx-auto">
            <p className="text-xs font-medium text-gray-700 mb-2">
              Getting started:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-600">
              {guideSteps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* 액션 버튼들 */}
        {(actionButton ||
          (hasActiveFilters && onResetFilters) ||
          onLoadSampleData ||
          helpLink) && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {hasActiveFilters && onResetFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="inline-flex items-center px-4 py-2.5 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Clear filters
                </button>
              )}
              {actionButton && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (guideSteps && guideSteps.length > 0) {
                        setShowGuideModal(true);
                      } else {
                        actionButton.onClick();
                      }
                    }}
                    className="inline-flex items-center px-5 py-2.5 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    {actionButton.icon && (
                      <span className="mr-2">{actionButton.icon}</span>
                    )}
                    {actionButton.label}
                  </button>
                  {guideSteps && guideSteps.length > 0 && (
                    <GuideModal
                      isOpen={showGuideModal}
                      onClose={() => {
                        setShowGuideModal(false);
                        actionButton.onClick();
                      }}
                      title="악기 추가 가이드"
                      steps={guideSteps}
                    />
                  )}
                </>
              )}
              {onLoadSampleData && (
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  className="inline-flex items-center px-4 py-2.5 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  샘플 데이터로 시작하기
                </button>
              )}
            </div>
            {helpLink && (
              <a
                href={helpLink.href}
                onClick={helpLink.onClick}
                className="text-xs text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {helpLink.label}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
