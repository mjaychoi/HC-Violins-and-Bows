// Dashboard-specific filter utilities

import { Instrument } from '@/types';
import { DashboardFilters } from '../types';
import { DateRange } from '@/hooks/usePageFilters';
import { DASHBOARD_FILTER_KEYS } from '../constants';

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
  if (filters[DASHBOARD_FILTER_KEYS.STATUS].length > 0) {
    filtered = filtered.filter(item =>
      filters[DASHBOARD_FILTER_KEYS.STATUS].includes(item.status)
    );
  }

  // Maker filter
  if (filters[DASHBOARD_FILTER_KEYS.MAKER].length > 0) {
    filtered = filtered.filter(
      item =>
        item.maker && filters[DASHBOARD_FILTER_KEYS.MAKER].includes(item.maker)
    );
  }

  // Type filter
  if (filters[DASHBOARD_FILTER_KEYS.TYPE].length > 0) {
    filtered = filtered.filter(
      item =>
        item.type && filters[DASHBOARD_FILTER_KEYS.TYPE].includes(item.type)
    );
  }

  // Subtype filter
  if (filters[DASHBOARD_FILTER_KEYS.SUBTYPE].length > 0) {
    filtered = filtered.filter(
      item =>
        item.subtype &&
        filters[DASHBOARD_FILTER_KEYS.SUBTYPE].includes(item.subtype)
    );
  }

  // Ownership filter
  if (filters[DASHBOARD_FILTER_KEYS.OWNERSHIP].length > 0) {
    filtered = filtered.filter(
      item =>
        item.ownership &&
        filters[DASHBOARD_FILTER_KEYS.OWNERSHIP].includes(item.ownership)
    );
  }

  // FIXED: Certificate filter - normalize to boolean to handle null/undefined
  if (filters[DASHBOARD_FILTER_KEYS.CERTIFICATE].length > 0) {
    filtered = filtered.filter(item => {
      // Normalize certificate to boolean for consistent filtering
      const cert = Boolean(item.certificate);
      return (filters[DASHBOARD_FILTER_KEYS.CERTIFICATE] as boolean[]).includes(
        cert
      );
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
  if (filters[DASHBOARD_FILTER_KEYS.HAS_CLIENTS].length > 0) {
    // FIXED: hasClients is now boolean[] (not string[])
    const wantHasClients =
      filters[DASHBOARD_FILTER_KEYS.HAS_CLIENTS][0] === true;
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
