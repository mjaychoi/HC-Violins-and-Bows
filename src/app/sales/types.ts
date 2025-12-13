export type SortColumn = 'sale_date' | 'sale_price' | 'client_name';
export type SortDirection = 'asc' | 'desc';
export type DatePreset = 'last7' | 'thisMonth' | 'lastMonth' | 'last3Months' | 'last12Months';
export type SaleStatus = 'Paid' | 'Refunded';

export interface SalesFilters {
  from: string;
  to: string;
  search: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  hasClient?: boolean | null; // null = 모두, true = has clients, false = no clients
}

export interface SalesTotals {
  revenue: number;
  refund: number;
  avgTicket: number;
  count: number;
  refundRate: number;
}

export interface DataQuality {
  hasInsufficientData: boolean;
  hasOutliers: boolean;
  hasSparseDates: boolean;
  isLowQuality: boolean;
}
