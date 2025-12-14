import Link from 'next/link';
import { EnrichedSale, SalesHistory } from '@/types';
import { SaleStatus } from '../types';
import { currency } from '../utils/salesFormatters';
import { SortColumn } from '../types';
import { classNames } from '@/utils/classNames';
import { TableSkeleton, EmptyState } from '@/components/common';
import Button from '@/components/common/Button';

// FIXED: Helper to parse YYYY-MM-DD as UTC to avoid timezone shifts
import { formatDisplayDate } from '@/utils/dateParsing';

interface SalesTableProps {
  sales: EnrichedSale[];
  loading: boolean;
  onSort: (column: SortColumn) => void;
  getSortArrow: (column: SortColumn) => React.ReactNode;
  onSendReceipt: (sale: EnrichedSale) => void;
  onRefund: (sale: SalesHistory) => void;
  onUndoRefund: (sale: SalesHistory) => void;
  statusForSale: (sale: EnrichedSale) => SaleStatus;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

// ✅ FIXED: Use centralized color tokens
import { getSalesStatusColor } from '@/utils/colorTokens';

function StatusBadge({ status }: { status: SaleStatus }) {
  // ✅ FIXED: Use centralized color tokens
  const className = getSalesStatusColor(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

export default function SalesTable({
  sales,
  loading,
  onSort,
  getSortArrow,
  onSendReceipt,
  onRefund,
  onUndoRefund,
  statusForSale,
  hasActiveFilters = false,
  onResetFilters,
}: SalesTableProps) {
  // Show skeleton while loading
  if (loading) {
    return <TableSkeleton rows={8} columns={7} />;
  }

  // Show empty state when no sales
  if (sales.length === 0) {
    return (
      <EmptyState
        title={
          hasActiveFilters
            ? 'No sales found matching your filters'
            : 'No sales yet'
        }
        description={
          hasActiveFilters
            ? 'Try adjusting your filters or clearing them to see all sales.'
            : 'Sales records will appear here once you add your first sale.'
        }
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
      />
    );
  }

  return (
    <div className={classNames.tableWrapper}>
      <div className={classNames.tableContainer}>
        <table className={classNames.table}>
          <thead className={classNames.tableHeader}>
            <tr>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('sale_date')}
              >
                <span className="inline-flex items-center gap-1">
                  Date
                  {getSortArrow('sale_date')}
                </span>
              </th>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('client_name')}
              >
                <span className="inline-flex items-center gap-1">
                  Client
                  {getSortArrow('client_name')}
                </span>
              </th>
              <th className={classNames.tableHeaderCell}>Instrument</th>
              <th
                className={classNames.tableHeaderCellSortable}
                onClick={() => onSort('sale_price')}
              >
                <span className="inline-flex items-center gap-1">
                  Amount
                  {getSortArrow('sale_price')}
                </span>
              </th>
              <th className={classNames.tableHeaderCell}>Status</th>
              <th className={classNames.tableHeaderCell}>Actions</th>
              <th className={classNames.tableHeaderCell}>Sale ID</th>
            </tr>
          </thead>
          <tbody className={classNames.tableBody}>
            {sales.map(sale => {
              const status = statusForSale(sale);
              return (
                <tr key={sale.id} className={classNames.tableRow}>
                  <td className={classNames.tableCell}>
                    {formatDisplayDate(sale.sale_date)}
                  </td>
                  <td className={classNames.tableCell}>
                    {sale.client && sale.client_id ? (
                      <div>
                        <Link
                          href={`/clients?clientId=${sale.client_id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          title="View client details"
                        >
                          {`${sale.client.first_name || ''} ${sale.client.last_name || ''}`.trim() ||
                            sale.client.email}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {sale.client?.email || sale.client_id || ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={classNames.tableCell}>
                    {sale.instrument && sale.instrument_id ? (
                      <div>
                        <Link
                          href={`/dashboard?instrumentId=${sale.instrument_id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          title="View instrument details"
                        >
                          {sale.instrument.maker ||
                            sale.instrument.type ||
                            'Instrument'}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {sale.instrument.type} {sale.instrument.subtype}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={classNames.tableCell}>
                    {currency.format(Math.abs(sale.sale_price))}
                  </td>
                  <td className={classNames.tableCell}>
                    <StatusBadge status={status} />
                  </td>
                  <td className={classNames.tableCell}>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => onSendReceipt(sale)}
                        disabled={!sale.client?.email}
                        size="sm"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:text-gray-400 disabled:bg-gray-50"
                        title={
                          sale.client?.email
                            ? 'Send receipt via email'
                            : 'No email available'
                        }
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                        Receipt
                      </Button>
                      {status !== 'Refunded' ? (
                        <Button
                          type="button"
                          onClick={() => onRefund(sale)}
                          disabled={loading}
                          size="sm"
                          variant="danger"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 border border-rose-600"
                          title="Issue refund"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          Refund
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => onUndoRefund(sale)}
                          disabled={loading}
                          size="sm"
                          variant="success"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100"
                          title="Undo refund"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                          Undo Refund
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className={`${classNames.tableCell} font-mono`}>
                    {sale.id}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
