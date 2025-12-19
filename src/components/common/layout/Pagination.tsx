import React from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  totalCount?: number;
  pageSize?: number;
  /**
   * 필터 적용 시 보여줄 필터링된 개수 (예: "20 of 100"에서 20)
   * 주로 Sales 페이지 등에서 사용. 제공되지 않으면 totalCount 기준으로 계산.
   */
  filteredCount?: number;
  /**
   * 필터가 적용되었는지 여부. true이고 filteredCount가 주어지면
   * "Showing X of Y (filtered)" 패턴을 사용할 수 있음.
   */
  hasFilters?: boolean;
  /**
   * compact 모드 여부 (현재 구현에서는 레이아웃만 제어하고 텍스트는 동일)
   */
  compact?: boolean;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  loading = false,
  totalCount,
  pageSize,
  filteredCount,
  hasFilters,
  compact = false,
}: PaginationProps) {
  // compact는 현재 레이아웃 분기만을 위한 힌트로, 아직 구체적인 스타일 분기는 없지만
  // 향후 확장을 위해 타입과 시그니처를 유지한다.
  void compact;
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const handleFirst = () => {
    if (safeCurrentPage === 1 || loading) return;
    onPageChange(1);
  };

  const handlePrev = () => {
    if (safeCurrentPage === 1 || loading) return;
    onPageChange(safeCurrentPage - 1);
  };

  const handleNext = () => {
    if (safeCurrentPage === safeTotalPages || loading) return;
    onPageChange(safeCurrentPage + 1);
  };

  const handleLast = () => {
    if (safeCurrentPage === safeTotalPages || loading) return;
    onPageChange(safeTotalPages);
  };

  const showCount =
    typeof totalCount === 'number' && typeof pageSize === 'number';

  const startItem = showCount
    ? (safeCurrentPage - 1) * pageSize + 1
    : undefined;
  const endItem =
    showCount && totalCount !== undefined
      ? Math.min(safeCurrentPage * pageSize, totalCount)
      : undefined;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-700">
      <div className="flex items-center gap-1">
        {showCount && totalCount !== undefined ? (
          <>
            <span>
              {hasFilters &&
              typeof filteredCount === 'number' &&
              filteredCount !== totalCount ? (
                <>
                  Showing{' '}
                  <span className="font-medium">
                    {filteredCount.toLocaleString()}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">
                    {totalCount.toLocaleString()}
                  </span>{' '}
                  (filtered)
                </>
              ) : (
                <>
                  Showing{' '}
                  <span className="font-medium">
                    {startItem}-{endItem}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">
                    {totalCount.toLocaleString()}
                  </span>
                </>
              )}
            </span>
          </>
        ) : (
          <span>
            Page <span className="font-medium">{safeCurrentPage}</span> of{' '}
            <span className="font-medium">{safeTotalPages}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
          onClick={handleFirst}
          disabled={safeCurrentPage === 1 || loading}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs sm:text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          ««
        </button>
        <button
          type="button"
          onClick={handlePrev}
          disabled={safeCurrentPage === 1 || loading}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs sm:text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={safeCurrentPage === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs sm:text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
        <button
          type="button"
          onClick={handleLast}
          disabled={safeCurrentPage === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs sm:text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          »»
        </button>
      </div>
    </div>
  );
}
