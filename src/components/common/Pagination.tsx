'use client';

import React, { useMemo } from 'react';

export interface PaginationProps {
  /**
   * 현재 페이지 번호 (1부터 시작)
   */
  currentPage: number;

  /**
   * 전체 페이지 수
   */
  totalPages: number;

  /**
   * 페이지 변경 핸들러
   */
  onPageChange: (page: number) => void;

  /**
   * 로딩 상태
   */
  loading?: boolean;

  /**
   * 전체 항목 수
   */
  totalCount?: number;

  /**
   * 페이지당 항목 수
   */
  pageSize?: number;

  /**
   * 컴팩트 모드 (페이지 번호 숨김)
   */
  compact?: boolean;

  /**
   * data-testid
   */
  'data-testid'?: string;

  /**
   * 필터링된 항목 수 (필터가 적용된 경우)
   */
  filteredCount?: number;

  /**
   * 필터가 적용되어 있는지 여부
   */
  hasFilters?: boolean;
}

/**
 * 재사용 가능한 페이지네이션 컴포넌트
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={page}
 *   totalPages={totalPages}
 *   onPageChange={setPage}
 *   totalCount={totalCount}
 *   pageSize={10}
 * />
 * ```
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  loading = false,
  totalCount,
  pageSize,
  compact: compactProp = false,
  'data-testid': testId = 'pagination',
  filteredCount,
  hasFilters = false,
}: PaginationProps) {
  // ✅ FIXED: React Hooks 규칙 위반 수정 - hooks를 early return 전으로 이동
  // ✅ FIXED: 모바일에서 compact 자동화
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    setIsMobile(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const compact = compactProp || isMobile;

  // ✅ FIXED: 표시할 페이지 번호 계산 - hooks를 early return 전으로 이동
  const pageNumbers = useMemo(() => {
    const pages: (number | { type: 'ellipsis'; id: string })[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      // Calculate start and end of visible range
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      // Adjust if we're near the start
      if (currentPage <= 3) {
        end = Math.min(4, totalPages - 1);
      }

      // Adjust if we're near the end
      if (currentPage >= totalPages - 2) {
        start = Math.max(totalPages - 3, 2);
      }

      // Add ellipsis before range if needed
      if (start > 2) {
        pages.push({ type: 'ellipsis', id: 'ellipsis-start' });
      }

      // Add visible page numbers
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis after range if needed
      if (end < totalPages - 1) {
        pages.push({ type: 'ellipsis', id: 'ellipsis-end' });
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [currentPage, totalPages]);

  // ✅ FIXED: React Hooks 규칙 - 모든 hooks를 early return 전에 호출
  // Calculate progress percentage for visual indicator
  const progressPercentage = useMemo(() => {
    if (!totalCount || !pageSize) return 0;
    return Math.min(100, ((currentPage * pageSize) / totalCount) * 100);
  }, [currentPage, pageSize, totalCount]);

  // 항목 범위 계산
  const startItem =
    totalCount && pageSize ? (currentPage - 1) * pageSize + 1 : undefined;
  const endItem =
    totalCount && pageSize
      ? Math.min(currentPage * pageSize, totalCount)
      : undefined;

  // 필터링 모드일 때의 표시 로직
  const displayCount =
    filteredCount !== undefined && hasFilters ? filteredCount : totalCount;
  const showFilteredInfo =
    hasFilters && filteredCount !== undefined && totalCount !== undefined;

  // 페이지가 1개 이하면 표시하지 않음
  if (totalPages <= 1) {
    return null;
  }

  const handleFirstPage = () => {
    if (currentPage !== 1 && !loading) {
      onPageChange(1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1 && !loading) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && !loading) {
      onPageChange(currentPage + 1);
    }
  };

  const handleLastPage = () => {
    if (currentPage !== totalPages && !loading) {
      onPageChange(totalPages);
    }
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${
        showFilteredInfo
          ? 'px-4 py-3 bg-gray-50 border-t border-gray-200'
          : 'py-4'
      }`}
      data-testid={testId}
    >
      {/* 항목 정보 with Progress Bar */}
      {displayCount !== undefined && (
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-700 mb-2">
            {showFilteredInfo ? (
              // 필터링 모드: "Showing X of Y records (filtered)"
              <>
                Showing <span className="font-medium">{filteredCount}</span> of{' '}
                <span className="font-medium">{totalCount}</span>{' '}
                {totalCount === 1 ? 'record' : 'records'}
                {filteredCount !== totalCount && (
                  <span className="text-gray-500 ml-1">(filtered)</span>
                )}
              </>
            ) : startItem !== undefined &&
              endItem !== undefined &&
              totalCount ? (
              // 일반 모드: "Showing X to Y of Z results"
              <>
                Showing <span className="font-medium">{startItem}</span> to{' '}
                <span className="font-medium">{endItem}</span> of{' '}
                <span className="font-medium">{totalCount}</span> results
              </>
            ) : totalCount !== undefined ? (
              // 컴팩트 모드 또는 페이지 정보 포함: "Page X of Y · Z records"
              <>
                Page {currentPage} of {totalPages} · {totalCount}{' '}
                {totalCount === 1 ? 'record' : 'records'}
              </>
            ) : (
              // 최소 정보만
              <>
                <span className="font-medium">{displayCount}</span> total
                results
              </>
            )}
          </div>
          {/* Progress Bar Indicator */}
          {totalCount && pageSize && totalPages > 1 && (
            <div className="flex items-center gap-2 w-full max-w-md">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                  role="progressbar"
                  aria-valuenow={progressPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Page ${currentPage} of ${totalPages}`}
                />
              </div>
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                {startItem && endItem ? `${startItem}–${endItem}` : currentPage}{' '}
                / {totalCount}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 페이지네이션 컨트롤 */}
      <div className="flex items-center gap-2">
        {/* First page button */}
        <button
          type="button"
          onClick={handleFirstPage}
          disabled={currentPage === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="First page"
          aria-label="Go to first page"
        >
          {/* ✅ FIXED: 시각적으로 First 아이콘으로 개선 */}
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Previous button */}
        <button
          type="button"
          onClick={handlePreviousPage}
          disabled={currentPage === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Go to previous page"
        >
          Prev
        </button>

        {/* Page numbers */}
        {!compact && (
          <div className="flex items-center gap-1">
            {pageNumbers.map(page => {
              // ✅ FIXED: ellipsis key 개선 - 타입으로 구분하여 안정적인 key 생성
              if (typeof page === 'object' && page.type === 'ellipsis') {
                return (
                  <span
                    key={page.id}
                    className="px-2 text-gray-400"
                    aria-hidden="true"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = page as number;
              const isActive = pageNum === currentPage;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => !loading && onPageChange(pageNum)}
                  disabled={loading}
                  className={`min-w-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
        )}

        {/* Current page indicator (compact mode) */}
        {compact && (
          <span className="px-3 text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
        )}

        {/* Next button */}
        <button
          type="button"
          onClick={handleNextPage}
          disabled={currentPage === totalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Go to next page"
        >
          Next
        </button>

        {/* Last page button */}
        <button
          type="button"
          onClick={handleLastPage}
          disabled={currentPage === totalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Last page"
          aria-label="Go to last page"
        >
          {/* ✅ FIXED: 시각적으로 Last 아이콘으로 개선 */}
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
