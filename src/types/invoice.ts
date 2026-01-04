export const INVOICE_SORT_COLUMNS = [
  'invoice_date',
  'due_date',
  'total',
  'status',
  'invoice_number',
  'created_at',
] as const;

export type InvoiceSortColumn = (typeof INVOICE_SORT_COLUMNS)[number];
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_DIR_BY_COLUMN: Partial<
  Record<InvoiceSortColumn, SortDirection>
> = {
  invoice_number: 'asc',
  status: 'asc',
  total: 'desc',
  created_at: 'desc',
  invoice_date: 'desc',
  due_date: 'desc',
};
