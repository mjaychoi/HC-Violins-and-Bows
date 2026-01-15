// Dashboard-specific filter utilities

import { Instrument } from '@/types';
import { DashboardFilters } from '../types';
import { DateRange } from '@/types/search';
import { DASHBOARD_FILTER_KEYS } from '../constants';

const ensureArray = <T>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

/**
 * Dashboard 필드 기반 필터링 함수
 * searchTerm과 dateRange를 제외한 모든 필터를 적용
 */
export function filterDashboardItems(
  items: Instrument[],
  filters: DashboardFilters,
  dateRange: DateRange | null
): Instrument[] {
  let filtered = items;

  // FIXED: Use Date objects instead of string comparison for reliable date filtering
  if (dateRange?.from || dateRange?.to) {
    filtered = filtered.filter(item => {
      try {
        const itemDate = new Date(item.created_at);
        const fromDate = dateRange.from
          ? new Date(dateRange.from)
          : new Date('1900-01-01');
        const toDate = dateRange.to
          ? new Date(dateRange.to)
          : new Date('9999-12-31');
        // Normalize to start/end of day for date-only semantics
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);
        return itemDate >= fromDate && itemDate <= toDate;
      } catch {
        // Invalid date format - exclude item
        return false;
      }
    });
  }

  // Status filter
  const statusFilters = ensureArray<string>(
    filters[DASHBOARD_FILTER_KEYS.STATUS]
  );
  if (statusFilters.length > 0) {
    filtered = filtered.filter(item => statusFilters.includes(item.status));
  }

  // Maker filter
  const makerFilters = ensureArray<string>(
    filters[DASHBOARD_FILTER_KEYS.MAKER]
  );
  if (makerFilters.length > 0) {
    filtered = filtered.filter(
      item => item.maker && makerFilters.includes(item.maker)
    );
  }

  // Type filter
  const typeFilters = ensureArray<string>(filters[DASHBOARD_FILTER_KEYS.TYPE]);
  if (typeFilters.length > 0) {
    filtered = filtered.filter(
      item => item.type && typeFilters.includes(item.type)
    );
  }

  // Subtype filter
  const subtypeFilters = ensureArray<string>(
    filters[DASHBOARD_FILTER_KEYS.SUBTYPE]
  );
  if (subtypeFilters.length > 0) {
    filtered = filtered.filter(
      item => item.subtype && subtypeFilters.includes(item.subtype)
    );
  }

  // Ownership filter
  const ownershipFilters = ensureArray<string>(
    filters[DASHBOARD_FILTER_KEYS.OWNERSHIP]
  );
  if (ownershipFilters.length > 0) {
    filtered = filtered.filter(
      item => item.ownership && ownershipFilters.includes(item.ownership)
    );
  }

  // FIXED: Certificate filter - normalize to boolean to handle null/undefined
  const certificateFilterValues = ensureArray<unknown>(
    filters[DASHBOARD_FILTER_KEYS.CERTIFICATE]
  );
  const certificateFilters = certificateFilterValues.map(value => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return Boolean(value);
  });
  if (certificateFilters.length > 0) {
    filtered = filtered.filter(item => {
      const cert =
        Boolean(item.has_certificate) ||
        Boolean(item.certificate_name) ||
        Boolean(item.certificate);
      return certificateFilters.includes(cert);
    });
  }

  // Price range filter
  if (
    filters[DASHBOARD_FILTER_KEYS.PRICE_RANGE].min ||
    filters[DASHBOARD_FILTER_KEYS.PRICE_RANGE].max
  ) {
    filtered = filtered.filter(item => {
      if (item.price === null || item.price === undefined) return false;
      const priceNum =
        typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      if (Number.isNaN(priceNum)) return false;

      const min = filters.priceRange.min
        ? parseFloat(filters.priceRange.min)
        : 0;
      const max = filters.priceRange.max
        ? parseFloat(filters.priceRange.max)
        : Infinity;

      return priceNum >= min && priceNum <= max;
    });
  }

  // FIXED: HAS_CLIENTS filter - check if item has connected clients
  // Note: items should be enriched with clients array (done in DashboardPage)
  // DashboardPage.enrichedItems ensures items have clients property
  const hasClientsFilters = ensureArray<boolean>(
    filters[DASHBOARD_FILTER_KEYS.HAS_CLIENTS]
  );
  if (hasClientsFilters.length > 0) {
    const wantHasClients = hasClientsFilters[0] === true;
    filtered = filtered.filter(item => {
      // Items should be enriched with clients array from DashboardPage
      const enrichedItem = item as { clients?: unknown[] };
      const hasClients = enrichedItem.clients
        ? enrichedItem.clients.length > 0
        : false;
      return hasClients === wantHasClients;
    });
  }

  return filtered;
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  [DASHBOARD_FILTER_KEYS.STATUS]: [],
  [DASHBOARD_FILTER_KEYS.MAKER]: [],
  [DASHBOARD_FILTER_KEYS.TYPE]: [],
  [DASHBOARD_FILTER_KEYS.SUBTYPE]: [],
  [DASHBOARD_FILTER_KEYS.OWNERSHIP]: [],
  [DASHBOARD_FILTER_KEYS.CERTIFICATE]: [],
  [DASHBOARD_FILTER_KEYS.PRICE_RANGE]: { min: '', max: '' },
  [DASHBOARD_FILTER_KEYS.HAS_CLIENTS]: [], // boolean[] - empty means no filter, [true] means has clients, [false] means no clients
};
