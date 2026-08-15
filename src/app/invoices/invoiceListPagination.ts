export const INVOICE_PAGE_SIZE = 10;
export const MAX_INVOICE_DELETE_PAGE_CLAMP_ATTEMPTS = 5;

export interface InvoicePageRefreshResult {
  totalPages: number;
  aborted?: boolean;
}

/**
 * Clamp the current Invoice list page to a valid 1-based page after deletion.
 * Server `totalPages` is the authority; the result is never below 1.
 */
export function resolveInvoicePageAfterDelete(
  currentPage: number,
  serverTotalPages: number
): number {
  const safeCurrent =
    Number.isFinite(currentPage) && currentPage >= 1
      ? Math.floor(currentPage)
      : 1;
  const lastPage =
    Number.isFinite(serverTotalPages) && serverTotalPages >= 1
      ? Math.floor(serverTotalPages)
      : 1;
  return Math.min(safeCurrent, lastPage);
}

/**
 * Fetch the current page after a successful delete, then converge onto a
 * server-authoritative valid page. Bounded so concurrent deletions cannot
 * loop forever. Does not call setPage; the caller should setPage only after
 * this returns so URL/effects cannot abort the corrective fetch.
 */
export async function syncInvoicePageAfterDelete<
  T extends InvoicePageRefreshResult,
>(options: {
  currentPage: number;
  refresh: (page: number) => Promise<T>;
  maxAttempts?: number;
}): Promise<{ page: number; result: T }> {
  const maxAttempts =
    options.maxAttempts ?? MAX_INVOICE_DELETE_PAGE_CLAMP_ATTEMPTS;
  let targetPage =
    Number.isFinite(options.currentPage) && options.currentPage >= 1
      ? Math.floor(options.currentPage)
      : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await options.refresh(targetPage);
    if (result.aborted) {
      throw new Error('Invoice list refresh was cancelled');
    }
    const nextPage = resolveInvoicePageAfterDelete(
      targetPage,
      result.totalPages
    );
    if (nextPage === targetPage) {
      return { page: targetPage, result };
    }
    targetPage = nextPage;
  }

  const fallback = await options.refresh(1);
  if (fallback.aborted) {
    throw new Error('Invoice list refresh was cancelled');
  }
  return { page: 1, result: fallback };
}
