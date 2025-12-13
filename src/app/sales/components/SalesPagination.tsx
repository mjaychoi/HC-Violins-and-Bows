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
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700">
      <div>
        {hasFilters ? (
          <>
            Showing <span className="font-medium">{filteredCount}</span> of{' '}
            <span className="font-medium">{totalCount}</span>{' '}
            {totalCount === 1 ? 'record' : 'records'}
            {filteredCount !== totalCount && (
              <span className="text-gray-500 ml-1">(filtered)</span>
            )}
          </>
        ) : (
          <>
            Page {page} of {safeTotalPages} · {totalCount}{' '}
            {totalCount === 1 ? 'record' : 'records'}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          ««
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1 || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        <span className="px-2 text-gray-600">
          {page} / {safeTotalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={page === safeTotalPages || loading}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          »»
        </button>
      </div>
    </div>
  );
}
