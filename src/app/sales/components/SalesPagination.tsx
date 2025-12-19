interface SalesPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  filteredCount: number;
  loading: boolean;
  hasFilters: boolean;
  onPageChange: (page: number) => void;
}

export default function SalesPagination({
  page,
  totalPages,
  totalCount,
  filteredCount,
  loading,
  hasFilters,
  onPageChange,
}: SalesPaginationProps) {
  // Safe clamp for page and totalPages to prevent invalid values
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(safeTotalPages, Math.max(1, page));

  // Guard against rapid clicks/duplicate calls during loading
  const handlePageChange = (newPage: number) => {
    if (loading) return;
    onPageChange(newPage);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700">
      <div>
        {hasFilters ? (
          <>
            Showing <span className="font-medium">{filteredCount}</span>{' '}
            {filteredCount === 1 ? 'record' : 'records'} of{' '}
            <span className="font-medium">{totalCount}</span>
            {filteredCount !== totalCount && (
              <span className="text-gray-500 ml-1">(filtered)</span>
            )}
          </>
        ) : (
          <>
            Page {safePage} of {safeTotalPages} · {totalCount}{' '}
            {totalCount === 1 ? 'record' : 'records'}
          </>
        )}
      </div>
      {/* Note: Pagination controls remain active even with filters.
          This is intentional - filters apply to the current page view,
          and users can navigate through filtered results across pages. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handlePageChange(1)}
          disabled={safePage === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="First page"
          title="First page"
        >
          ««
        </button>
        <button
          type="button"
          onClick={() => handlePageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
          title="Previous page"
        >
          Prev
        </button>
        <span className="px-2 text-gray-600">
          {safePage} / {safeTotalPages}
        </span>
        <button
          type="button"
          onClick={() =>
            handlePageChange(Math.min(safeTotalPages, safePage + 1))
          }
          disabled={safePage === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
          title="Next page"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => handlePageChange(safeTotalPages)}
          disabled={safePage === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Last page"
          title="Last page"
        >
          »»
        </button>
      </div>
    </div>
  );
}
