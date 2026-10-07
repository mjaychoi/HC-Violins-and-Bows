'use client';

import React from 'react';
import { Input } from '@/components/common/inputs';
import {
  buildFilterSelect,
  filterButtonClasses,
  filterSelectClasses,
  filterToolbarClasses,
} from '@/utils/filterUI';
import type { InvoiceStatus } from '@/types';
import { INVOICE_STATUSES } from '@/utils/invoiceStatusTransitions';

export type { InvoiceStatus };
export type InvoiceFilterStatus = InvoiceStatus | '';

const STATUS_FILTER_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

interface InvoiceFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;

  fromDate: string;
  onFromDateChange: (value: string) => void;

  toDate: string;
  onToDateChange: (value: string) => void;

  status: InvoiceFilterStatus;
  onStatusChange: (value: InvoiceFilterStatus) => void;

  onClearFilters: () => void;
  hasActiveFilters: boolean;

  onOpenSettings?: () => void;
  settingsDisabled?: boolean;
  settingsDisabledReason?: string;
}

export default function InvoiceFilters({
  search,
  onSearchChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  status,
  onStatusChange,
  onClearFilters,
  hasActiveFilters,
  onOpenSettings,
  settingsDisabled = false,
  settingsDisabledReason,
}: InvoiceFiltersProps) {
  const statusSelectProps = buildFilterSelect({
    value: status,
    onChange: (value: string) => onStatusChange(value as InvoiceFilterStatus),
    options: [
      { value: '', label: 'All Status' },
      ...INVOICE_STATUSES.map(value => ({
        value,
        label: STATUS_FILTER_LABELS[value],
      })),
    ],
  });

  return (
    <div className={`${filterToolbarClasses.container} mb-6`}>
      <div
        className={`${filterToolbarClasses.leftSection} w-full min-w-0 lg:flex-1`}
      >
        <div className="w-full min-w-0 flex-1 sm:min-w-[220px]">
          <Input
            type="text"
            aria-label="Search invoices"
            placeholder="Search by invoice number or notes..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={e => onFromDateChange(e.target.value)}
            max={toDate || undefined}
          />
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <Input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={e => onToDateChange(e.target.value)}
              min={fromDate || undefined}
            />
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                disabled={settingsDisabled}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Invoice settings"
                title={settingsDisabledReason || 'Invoice Settings'}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="w-full min-w-0 sm:w-auto sm:min-w-[180px]">
          <select
            {...statusSelectProps}
            className={`${filterSelectClasses.select} w-full sm:w-auto`}
          />
        </div>
      </div>

      <div className={filterToolbarClasses.rightSection}>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className={filterButtonClasses.reset}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
