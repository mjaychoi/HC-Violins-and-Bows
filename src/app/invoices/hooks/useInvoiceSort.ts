'use client';

import { useState, useCallback } from 'react';
import {
  DEFAULT_DIR_BY_COLUMN,
  InvoiceSortColumn,
  SortDirection,
} from '@/types/invoice';

export function useInvoiceSort(
  initialColumn: InvoiceSortColumn = 'invoice_date',
  initialDirection: SortDirection = 'desc'
) {
  const [sortColumn, setSortColumn] =
    useState<InvoiceSortColumn>(initialColumn);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialDirection);

  const handleSort = useCallback(
    (column: InvoiceSortColumn) => {
      setSortColumn(prevColumn => {
        if (prevColumn === column) {
          setSortDirection(prevDir => (prevDir === 'asc' ? 'desc' : 'asc'));
          return prevColumn;
        }
        setSortDirection(DEFAULT_DIR_BY_COLUMN[column] ?? initialDirection);
        return column;
      });
    },
    [initialDirection]
  );

  const getSortState = useCallback(
    (
      column: InvoiceSortColumn
    ): { active: false } | { active: true; direction: SortDirection } => {
      if (sortColumn !== column) return { active: false };
      return { active: true, direction: sortDirection };
    },
    [sortColumn, sortDirection]
  );

  return {
    sortColumn,
    sortDirection,
    handleSort,
    getSortState,
    setSortColumn,
    setSortDirection,
  };
}
