'use client';

import React from 'react';
import Link from 'next/link';
import { EnrichedSale, SalesHistory } from '@/types';
import { SaleStatus } from '../types';
import { currency } from '../utils/salesFormatters';
import { SortColumn } from '../types';
import { classNames, cn } from '@/utils/classNames';
import { TableSkeleton, EmptyState } from '@/components/common';
import { Button } from '@/components/common/inputs';
import { useInlineEdit } from '@/hooks/useInlineEdit';
import {
  InlineNumberField,
  InlineSelectField,
  InlineEditActions,
  InlineEditButton,
} from '@/components/common/InlineEditFields';

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
  onUpdateSale?: (id: string, data: { sale_price?: number }) => Promise<void>;
}

// ✅ FIXED: Use centralized color tokens
import { getSalesStatusColor } from '@/utils/colorTokens';

const StatusBadge = React.memo(function StatusBadge({
  status,
}: {
  status: SaleStatus;
}) {
  // ✅ FIXED: Use centralized color tokens
  // 테이블 셀 안의 상태 칩이므로 muted variant 사용 (테이블 기본 규칙)
  const className = getSalesStatusColor(status, 'muted');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
});

function SalesTable({
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
  onUpdateSale,
}: SalesTableProps) {
  // 인라인 편집 훅 (sale_price와 status)
  const inlineEditPrice = useInlineEdit<SalesHistory>({
    onSave: async (id, data) => {
      if (onUpdateSale && data.sale_price !== undefined) {
        await onUpdateSale(id, { sale_price: data.sale_price as number });
      }
    },
    highlightDuration: 2000,
  });

  // 상태 편집용: status는 sale_price의 부호로 결정되므로 sale_price를 업데이트
  const inlineEditStatus = useInlineEdit<
    SalesHistory & { status?: SaleStatus }
  >({
    onSave: async (id, data) => {
      if (onUpdateSale) {
        // 상태 변경: Paid -> Refunded는 가격을 음수로, Refunded -> Paid는 가격을 양수로
        const currentSale = sales.find(s => s.id === id);
        if (currentSale && data.status) {
          const newStatus = data.status as SaleStatus;
          const currentPrice = Math.abs(currentSale.sale_price);
          const newPrice =
            newStatus === 'Refunded' ? -currentPrice : currentPrice;
          await onUpdateSale(id, { sale_price: newPrice });
        }
      }
    },
    highlightDuration: 2000,
  });
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
                  <td
                    className={cn(
                      classNames.tableCell,
                      inlineEditPrice.editingId === sale.id &&
                        'ring-2 ring-blue-200 bg-blue-50',
                      inlineEditPrice.savedId === sale.id &&
                        'ring-2 ring-green-200 bg-green-50'
                    )}
                  >
                    {inlineEditPrice.editingId === sale.id ? (
                      <div className="space-y-2">
                        <InlineNumberField
                          isEditing={true}
                          value={Math.abs(sale.sale_price)}
                          onChange={value => {
                            if (value !== null) {
                              // 현재 상태에 따라 부호 유지
                              const sign = sale.sale_price < 0 ? -1 : 1;
                              inlineEditPrice.updateField(
                                'sale_price',
                                sign * value
                              );
                            }
                          }}
                          placeholder="Enter amount"
                          min={0.01}
                          step={0.01}
                          format={val => currency.format(val || 0)}
                          editingClassName="w-full"
                          onEnter={inlineEditPrice.saveEditing}
                          onEscape={inlineEditPrice.cancelEditing}
                        />
                        <InlineEditActions
                          isSaving={inlineEditPrice.isSaving}
                          onSave={inlineEditPrice.saveEditing}
                          onCancel={inlineEditPrice.cancelEditing}
                          className="justify-end"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 flex-1">
                          {currency.format(Math.abs(sale.sale_price))}
                        </span>
                        <InlineEditButton
                          onClick={() =>
                            inlineEditPrice.startEditing(sale.id, {
                              sale_price: sale.sale_price,
                            })
                          }
                          aria-label="Edit sale price"
                          size="sm"
                        />
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      classNames.tableCell,
                      inlineEditStatus.editingId === sale.id &&
                        'ring-2 ring-blue-200 bg-blue-50',
                      inlineEditStatus.savedId === sale.id &&
                        'ring-2 ring-green-200 bg-green-50'
                    )}
                  >
                    {inlineEditStatus.editingId === sale.id ? (
                      <div className="space-y-2">
                        <InlineSelectField
                          isEditing={true}
                          value={status}
                          onChange={value =>
                            inlineEditStatus.updateField('status', value)
                          }
                          options={[
                            { value: 'Paid', label: 'Paid' },
                            { value: 'Refunded', label: 'Refunded' },
                          ]}
                          editingClassName="w-full"
                          onEnter={inlineEditStatus.saveEditing}
                          onEscape={inlineEditStatus.cancelEditing}
                        />
                        <InlineEditActions
                          isSaving={inlineEditStatus.isSaving}
                          onSave={inlineEditStatus.saveEditing}
                          onCancel={inlineEditStatus.cancelEditing}
                          className="justify-end"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <StatusBadge status={status} />
                        </div>
                        <InlineEditButton
                          onClick={() =>
                            inlineEditStatus.startEditing(sale.id, {
                              status: status,
                            })
                          }
                          aria-label="Edit sale status"
                          size="sm"
                        />
                      </div>
                    )}
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
                          variant="secondary"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-red-300 hover:border-red-400"
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

export default React.memo(SalesTable);
