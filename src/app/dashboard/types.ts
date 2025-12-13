import { Instrument } from '@/types';
import type { DashboardSortField } from '@/types/sort';

// Re-export for backwards compatibility
export type { DashboardSortField };

export type DashboardFilters = {
  status: string[];
  maker: string[];
  type: string[];
  subtype: string[];
  ownership: string[];
  certificate: boolean[];
  priceRange: { min: string; max: string };
  // FIXED: hasClients should be boolean[] (not string[]) since it's a single true/false filter
  hasClients: boolean[];
};
export type DashboardArrayFilterKeys = {
  [K in keyof DashboardFilters]: DashboardFilters[K] extends Array<unknown>
    ? K
    : never;
}[keyof DashboardFilters];

export type DashboardFilterOptions = {
  status: string[];
  maker: string[];
  type: string[];
  subtype: string[];
  ownership: string[];
};

export type DashboardFilterOptionKey = keyof DashboardFilterOptions;

export type DashboardFilterLabelMap = Record<DashboardFilterOptionKey, string>;

export type DashboardFilterKeys = keyof DashboardFilters;

export type DashboardInstrument = Instrument;
