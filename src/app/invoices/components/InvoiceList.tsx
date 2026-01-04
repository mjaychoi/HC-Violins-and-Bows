'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Invoice } from '@/types';
import type { InvoiceSortColumn, SortDirection } from '@/types/invoice';
import { classNames, cn } from '@/utils/classNames';
import { TableSkeleton, EmptyState, Pagination } from '@/components/common';
import { Button } from '@/components/common/inputs';
import { getButtonVariantClasses } from '@/utils/colorTokens';
import OptimizedImage from '@/components/common/OptimizedImage';

interface InvoiceListProps {
  invoices: Invoice[];
  loading: boolean;
  onSort: (column: InvoiceSortColumn) => void;
  getSortState: (
    column: InvoiceSortColumn
  ) => { active: false } | { active: true; direction: SortDirection };
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  onDownload?: (invoice: Invoice) => void;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

function InvoiceList({
  invoices,
  loading,
  onSort,
  getSortState,
  onEdit,
  onDelete,
  onDownload,
  hasActiveFilters = false,
  onResetFilters,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 10,
  onPageChange,
  emptyTitle,
  emptyDescription,
}: InvoiceListProps) {
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(
    null
  );

  if (loading) {
    return <TableSkeleton rows={8} columns={8} />;
  }

  if (invoices.length === 0) {
    const emptyStateTitle =
      emptyTitle ??
      (hasActiveFilters
        ? 'No invoices found matching your filters'
        : 'No invoices yet');
    const emptyStateDescription =
      emptyDescription ??
      (hasActiveFilters
        ? 'Try adjusting your filters or clearing them to see all invoices.'
        : 'Invoices will appear here once you create your first invoice.');

    return (
      <EmptyState
        title={emptyStateTitle}
        description={emptyStateDescription}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
      />
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className={classNames.tableWrapper}>
      <div className={classNames.tableContainer}>
        <table className={classNames.table}>
          <thead className={classNames.tableHeader}>
            <tr>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('invoice_number')}
              >
                <span className="inline-flex items-center gap-1">
                  Invoice #
                  <span>
                    {(() => {
                      const sortState = getSortState('invoice_number');
                      if (!sortState.active) return '';
                      return sortState.direction === 'asc' ? '↑' : '↓';
                    })()}
                  </span>
                </span>
              </th>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('invoice_date')}
              >
                <span className="inline-flex items-center gap-1">
                  Date
                  <span>
                    {(() => {
                      const sortState = getSortState('invoice_date');
                      if (!sortState.active) return '';
                      return sortState.direction === 'asc' ? '↑' : '↓';
                    })()}
                  </span>
                </span>
              </th>
              <th className={classNames.tableHeaderCell}>Client</th>
              <th>Items</th>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('total')}
              >
                <span className="inline-flex items-center gap-1">
                  Total
                  <span>
                    {(() => {
                      const sortState = getSortState('total');
                      if (!sortState.active) return '';
                      return sortState.direction === 'asc' ? '↑' : '↓';
                    })()}
                  </span>
                </span>
              </th>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('status')}
              >
                <span className="inline-flex items-center gap-1">
                  Status
                  <span>
                    {(() => {
                      const sortState = getSortState('status');
                      if (!sortState.active) return '';
                      return sortState.direction === 'asc' ? '↑' : '↓';
                    })()}
                  </span>
                </span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody className={classNames.tableBody}>
            {invoices.map(invoice => {
              const isExpanded = expandedInvoiceId === invoice.id;
              const clientName = invoice.client
                ? `${invoice.client.first_name || ''} ${invoice.client.last_name || ''}`.trim() ||
                  invoice.client.email ||
                  'Unknown'
                : '—';

              return (
                <React.Fragment key={invoice.id}>
                  <tr
                    className={cn(
                      classNames.tableRow,
                      'cursor-pointer hover:bg-blue-50/30 transition-colors'
                    )}
                    onClick={() =>
                      setExpandedInvoiceId(isExpanded ? null : invoice.id)
                    }
                  >
                    <td className={classNames.tableCell}>
                      <div className="font-mono font-medium text-gray-900">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          onClick={e => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </div>
                    </td>
                    <td className={classNames.tableCell}>
                      <div className="text-sm text-gray-900">
                        {formatDate(invoice.invoice_date)}
                      </div>
                      {invoice.due_date && (
                        <div className="text-xs text-gray-500">
                          Due: {formatDate(invoice.due_date)}
                        </div>
                      )}
                    </td>
                    <td className={classNames.tableCell}>
                      {invoice.client_id ? (
                        <Link
                          href={`/clients?clientId=${invoice.client_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {clientName}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={classNames.tableCell}>
                      <div className="text-sm text-gray-900">
                        {invoice.items?.length || 0}{' '}
                        {invoice.items?.length === 1 ? 'item' : 'items'}
                      </div>
                    </td>
                    <td className={classNames.tableCell}>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(invoice.total, invoice.currency)}
                      </div>
                    </td>
                    <td className={classNames.tableCell}>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          statusColors[invoice.status] || statusColors.draft
                        )}
                      >
                        {invoice.status.charAt(0).toUpperCase() +
                          invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className={classNames.tableCell}>
                      <div
                        className="flex items-center gap-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className={`${getButtonVariantClasses('secondary')} px-3 py-1 text-sm rounded-md focus:outline-none focus:ring-2`}
                        >
                          View
                        </Link>
                        {onDownload && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onDownload(invoice)}
                          >
                            Download PDF
                          </Button>
                        )}
                        {onEdit && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEdit(invoice)}
                          >
                            Edit
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onDelete(invoice)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && invoice.items && invoice.items.length > 0 && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 p-4">
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900 mb-2">
                            Items
                          </h4>
                          <div className="space-y-2">
                            {invoice.items.map((item, idx) => (
                              <div
                                key={item.id || idx}
                                className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200"
                              >
                                {item.image_url && (
                                  <div className="flex-shrink-0">
                                    <OptimizedImage
                                      src={item.image_url}
                                      alt={item.description}
                                      width={80}
                                      height={80}
                                      className="rounded-lg object-cover"
                                    />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">
                                    {item.description}
                                  </div>
                                  {item.instrument_id && (
                                    <div className="text-xs text-gray-500">
                                      Instrument ID: {item.instrument_id}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm text-gray-500">
                                    {item.qty} ×{' '}
                                    {formatCurrency(
                                      item.rate,
                                      invoice.currency
                                    )}
                                  </div>
                                  <div className="font-semibold text-gray-900">
                                    {formatCurrency(
                                      item.amount,
                                      invoice.currency
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {invoice.notes && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-sm text-gray-700">
                                <strong>Notes:</strong> {invoice.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 px-6 py-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange || (() => {})}
            loading={loading}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </div>
      )}
    </div>
  );
}

export default InvoiceList;
