import type { ClientInstrument } from '@/types';

/**
 * Bounded page size for the shared org-wide Connections drain.
 * Matches the connections GET `MAX_PAGE_SIZE` so each request stays capped
 * while completeness comes from retrieving every page.
 */
export const CONNECTIONS_COMPLETE_PAGE_SIZE = 100;

/**
 * Consistency model for the complete drain:
 * offset pages are fetched in order under deterministic
 * `(created_at DESC, id DESC)` ordering. Concurrent writes during the
 * sequence are not a transactional snapshot; later context mutations and
 * forced refetches reconcile live changes. Duplicate ids at page
 * boundaries are collapsed; they do not hide a stuck pagination loop.
 */
export class ConnectionCompleteFetchCancelled extends Error {
  constructor(message = 'Connection complete fetch cancelled') {
    super(message);
    this.name = 'ConnectionCompleteFetchCancelled';
  }
}

export class ConnectionCompleteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionCompleteFetchError';
  }
}

export type ConnectionListPageEnvelope = {
  data: unknown;
  count?: unknown;
  page?: unknown;
  pageSize?: unknown;
  totalPages?: unknown;
  truncated?: unknown;
  pagination?: {
    page?: unknown;
    pageSize?: unknown;
    totalCount?: unknown;
    totalPages?: unknown;
  } | null;
};

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function readPageMeta(envelope: ConnectionListPageEnvelope) {
  const pagination =
    envelope.pagination &&
    typeof envelope.pagination === 'object' &&
    !Array.isArray(envelope.pagination)
      ? envelope.pagination
      : null;

  return {
    page: toNonNegativeInt(pagination?.page) ?? toNonNegativeInt(envelope.page),
    pageSize:
      toNonNegativeInt(pagination?.pageSize) ??
      toNonNegativeInt(envelope.pageSize),
    totalCount:
      toNonNegativeInt(pagination?.totalCount) ??
      toNonNegativeInt(envelope.count),
    totalPages:
      toNonNegativeInt(pagination?.totalPages) ??
      toNonNegativeInt(envelope.totalPages),
  };
}

function compareCreatedAtDescIdDesc(
  a: ClientInstrument,
  b: ClientInstrument
): number {
  const aTime = Date.parse(a.created_at ?? '') || 0;
  const bTime = Date.parse(b.created_at ?? '') || 0;

  if (aTime !== bTime) return bTime - aTime;
  if (a.id === b.id) return 0;

  return a.id < b.id ? 1 : -1;
}

export async function fetchCompleteConnectionCollection(options: {
  fetchPage: (
    page: number,
    pageSize: number
  ) => Promise<ConnectionListPageEnvelope>;
  pageSize?: number;
  isCancelled?: () => boolean;
}): Promise<ClientInstrument[]> {
  const pageSize = options.pageSize ?? CONNECTIONS_COMPLETE_PAGE_SIZE;
  const isCancelled = options.isCancelled ?? (() => false);
  const byId = new Map<string, ClientInstrument>();
  let expectedTotalCount: number | null = null;
  let expectedTotalPages: number | null = null;
  let page = 1;

  while (true) {
    if (isCancelled()) {
      throw new ConnectionCompleteFetchCancelled();
    }

    const envelope = await options.fetchPage(page, pageSize);

    if (isCancelled()) {
      throw new ConnectionCompleteFetchCancelled();
    }

    if (!Array.isArray(envelope.data)) {
      throw new ConnectionCompleteFetchError(
        'Connection page response did not include an array data payload.'
      );
    }

    const meta = readPageMeta(envelope);

    if (meta.page != null && meta.page !== page) {
      throw new ConnectionCompleteFetchError(
        `Connection page response reported page ${meta.page} but page ${page} was requested.`
      );
    }

    if (page === 1) {
      expectedTotalCount = meta.totalCount;
      expectedTotalPages = meta.totalPages;
    } else {
      if (
        meta.totalPages != null &&
        expectedTotalPages != null &&
        meta.totalPages !== expectedTotalPages
      ) {
        throw new ConnectionCompleteFetchError(
          'Connection pagination totalPages changed between pages.'
        );
      }

      if (
        meta.totalCount != null &&
        expectedTotalCount != null &&
        meta.totalCount !== expectedTotalCount
      ) {
        throw new ConnectionCompleteFetchError(
          'Connection pagination totalCount changed between pages.'
        );
      }
    }

    const uniqueBefore = byId.size;

    for (const row of envelope.data) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new ConnectionCompleteFetchError(
          'Connection page contained a malformed row.'
        );
      }

      const id = (row as { id?: unknown }).id;

      if (typeof id !== 'string' || id.length === 0) {
        throw new ConnectionCompleteFetchError(
          'Connection page contained a row without a stable id.'
        );
      }

      if (!byId.has(id)) {
        byId.set(id, row as ClientInstrument);
      }
    }

    const received = envelope.data.length;
    const uniqueAfter = byId.size;
    const reachedCount =
      expectedTotalCount != null && uniqueAfter >= expectedTotalCount;
    const reachedPages =
      expectedTotalPages != null &&
      expectedTotalPages > 0 &&
      page >= expectedTotalPages;
    const shortPage = received < pageSize;

    if (expectedTotalCount === 0) {
      if (uniqueAfter > 0) {
        throw new ConnectionCompleteFetchError(
          'Connection page returned rows but pagination totalCount is 0.'
        );
      }

      break;
    }

    if (page === 1 && received === 0) {
      if (expectedTotalCount != null && expectedTotalCount > 0) {
        throw new ConnectionCompleteFetchError(
          'Connection page returned zero rows but pagination claims more exist.'
        );
      }

      break;
    }

    if (reachedCount || reachedPages) {
      break;
    }

    if (received === 0) {
      throw new ConnectionCompleteFetchError(
        'Connection page returned zero rows before the collection was complete.'
      );
    }

    if (uniqueAfter === uniqueBefore) {
      throw new ConnectionCompleteFetchError(
        'Connection pagination made no progress (duplicate page).'
      );
    }

    if (shortPage) {
      if (expectedTotalCount == null && expectedTotalPages == null) {
        break;
      }

      if (expectedTotalCount != null && uniqueAfter < expectedTotalCount) {
        throw new ConnectionCompleteFetchError(
          'Connection page was short before pagination totalCount was reached.'
        );
      }

      break;
    }

    if (expectedTotalCount == null && expectedTotalPages == null) {
      throw new ConnectionCompleteFetchError(
        'Connection page was full but pagination metadata was missing; cannot complete the drain safely.'
      );
    }

    page += 1;
  }

  if (isCancelled()) {
    throw new ConnectionCompleteFetchCancelled();
  }

  return Array.from(byId.values()).sort(compareCreatedAtDescIdDesc);
}
