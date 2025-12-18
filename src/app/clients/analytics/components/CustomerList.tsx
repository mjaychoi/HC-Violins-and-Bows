import React, { useEffect, useRef } from 'react';
import { CustomerWithPurchases } from '../types';
import { format } from 'date-fns';
import { EmptyState, TagBadge, InterestBadge } from '@/components/common';
import { parseYMDUTC } from '@/utils/dateParsing';

interface CustomerListProps {
  customers: CustomerWithPurchases[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 필터/검색 활성 여부 (빈 상태 카피/버튼 제어) */
  hasActiveFilters?: boolean;
  /** 필터/검색 리셋 핸들러 */
  onResetFilters?: () => void;
  /** 새 고객 추가 CTA가 필요할 때 */
  onAddCustomer?: () => void;
}

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export const CustomerListComponent = ({
  customers,
  selectedId,
  onSelect,
  hasActiveFilters = false,
  onResetFilters,
  onAddCustomer,
}: CustomerListProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ✅ Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listRef.current?.contains(e.target as Node)) return;

      const currentIndex = customers.findIndex(c => c.id === selectedId);
      if (currentIndex === -1) return;

      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          newIndex = Math.min(currentIndex + 1, customers.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = customers.length - 1;
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex && customers[newIndex]) {
        onSelect(customers[newIndex].id);
        buttonRefs.current[newIndex]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [customers, selectedId, onSelect]);

  // Update button refs array when customers change
  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, customers.length);
  }, [customers.length]);

  if (!customers.length) {
    return (
      <EmptyState
        title={
          hasActiveFilters
            ? 'No customers found matching your filters'
            : 'No customers yet'
        }
        description={
          hasActiveFilters
            ? 'Try adjusting your filters or clearing them to see all customers.'
            : 'Add your first customer to start tracking relationships.'
        }
        hasActiveFilters={hasActiveFilters}
        onResetFilters={hasActiveFilters ? onResetFilters : undefined}
        actionButton={
          !hasActiveFilters && onAddCustomer
            ? { label: 'Add customer', onClick: onAddCustomer }
            : undefined
        }
      />
    );
  }

  // ✅ Format date for display (separate from sorting)
  const formatDateForDisplay = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      const date = parseYMDUTC(dateStr);
      return format(date, 'MMM d, yyyy');
    } catch {
      return dateStr; // Fallback to raw string if parsing fails
    }
  };

  return (
    <div
      ref={listRef}
      className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-200"
      role="listbox"
      aria-label="Customer list"
      tabIndex={0}
    >
      {customers.map(customer => {
        const fullName =
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
          'Unnamed';
        const totalSpend = customer.purchases.reduce(
          (sum: number, p: { amount: number }) => sum + p.amount,
          0
        );
        // ✅ Use lastPurchaseAt for display (already formatted in useCustomers)
        const recentDate = formatDateForDisplay(customer.lastPurchaseAt);
        // ✅ Tags are already normalized in useCustomers
        const tags = customer.tags;
        const index = customers.indexOf(customer);
        return (
          <button
            key={customer.id}
            ref={el => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => onSelect(customer.id)}
            // ✅ Removed unused focusedIndex handlers
            role="option"
            aria-selected={selectedId === customer.id}
            tabIndex={selectedId === customer.id ? 0 : -1}
            className={`w-full text-left px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              selectedId === customer.id
                ? 'bg-blue-50 border-l-4 border-l-blue-600'
                : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {fullName}
              </div>
              <div className="text-sm text-gray-500 mt-0.5 truncate">
                {customer.email || 'No email'}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {tags.slice(0, 2).map((tag, i) => (
                      <TagBadge key={`${tag}-${i}`} tag={tag} context="table" />
                    ))}
                    {tags.length > 2 && (
                      <span className="text-xs text-gray-400">
                        +{tags.length - 2}
                      </span>
                    )}
                  </div>
                )}
                {customer.interest && (
                  <InterestBadge interest={customer.interest} context="table" />
                )}
              </div>
            </div>
            <div className="text-right ml-4 shrink-0">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Total
              </div>
              <div className="font-semibold text-gray-900">
                {formatAmount(totalSpend)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Last: {recentDate}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export const CustomerList = React.memo(CustomerListComponent);
