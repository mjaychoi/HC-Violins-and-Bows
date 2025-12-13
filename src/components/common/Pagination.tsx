'use client';

import React from 'react';

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
  compact = false,
  'data-testid': testId = 'pagination',
  filteredCount,
  hasFilters = false,
}: PaginationProps) {
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

  // 표시할 페이지 번호 계산
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      // 전체 페이지가 적으면 모두 표시
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 현재 페이지 주변만 표시
      if (currentPage <= 3) {
        // 앞부분
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // 뒷부분
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 중간
        pages.push(1);
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

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

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${
        showFilteredInfo
          ? 'px-4 py-3 bg-gray-50 border-t border-gray-200'
          : 'py-4'
      }`}
      data-testid={testId}
    >
      {/* 항목 정보 */}
      {displayCount !== undefined && (
        <div className="text-sm text-gray-700">
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
          ) : startItem !== undefined && endItem !== undefined && totalCount ? (
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
              <span className="font-medium">{displayCount}</span> total results
            </>
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
          ««
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
            {pageNumbers.map((page, index) => {
              if (page === 'ellipsis') {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 text-gray-400"
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
          »»
        </button>
      </div>
    </div>
  );
}
