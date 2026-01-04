'use client';

import React from 'react';
import { Input } from '@/components/common/inputs';
import {
  buildFilterSelect,
  filterButtonClasses,
  filterSelectClasses,
  filterToolbarClasses,
} from '@/utils/filterUI';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export type InvoiceFilterStatus = InvoiceStatus | '';

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount?: number; // derived (quantity * unit_price)
}

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
}: InvoiceFiltersProps) {
  const statusSelectProps = buildFilterSelect({
    value: status,
    onChange: (value: string) => onStatusChange(value as InvoiceFilterStatus),
    options: [
      { value: '', label: 'All Status' },
      { value: 'draft', label: 'Draft' },
      { value: 'sent', label: 'Sent' },
      { value: 'paid', label: 'Paid' },
      { value: 'overdue', label: 'Overdue' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'void', label: 'Voided' },
    ],
  });

  return (
    <div className={`${filterToolbarClasses.container} mb-6`}>
      <div className={filterToolbarClasses.leftSection}>
        <div className="flex-1 min-w-[220px]">
          <Input
            type="text"
            aria-label="Search invoices"
            placeholder="Search by invoice number or notes..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={e => onFromDateChange(e.target.value)}
            max={toDate || undefined}
          />
          <Input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={e => onToDateChange(e.target.value)}
            min={fromDate || undefined}
          />
        </div>

        <div className="min-w-[180px]">
          <select
            {...statusSelectProps}
            className={filterSelectClasses.select}
          />
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Invoice settings"
            title="Invoice Settings"
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
