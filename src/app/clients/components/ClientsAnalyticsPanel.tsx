'use client';

import { useMemo, useState } from 'react';
import { CustomerStats } from '../analytics/components/CustomerStats';
import { CustomerSearch } from '../analytics/components/CustomerSearch';
import { CustomerList } from '../analytics/components/CustomerList';
import { CustomerDetail } from '../analytics/components/CustomerDetail';
import { PurchaseHistory } from '../analytics/components/PurchaseHistory';
import { useCustomers } from '../analytics/hooks/useCustomers';
import { TableSkeleton } from '@/components/common';

interface ClientsAnalyticsPanelProps {
  /** When false, analytics fetches are disabled (list tab active). */
  enabled: boolean;
  /**
   * Org client list may be truncated (API 1,000-row safety cap).
   * Metrics below are derived from the loaded client collection only.
   */
  clientsTruncated?: boolean;
}

/**
 * Canonical analytics view for `/clients?tab=analytics`.
 * Totals are computed from the currently loaded (possibly truncated) client
 * collection plus sales summary APIs — not a full org census when truncated.
 */
export default function ClientsAnalyticsPanel({
  enabled,
  clientsTruncated = false,
}: ClientsAnalyticsPanelProps) {
  const {
    customers,
    allCustomersCount,
    searchTerm,
    setSearchTerm,
    tagFilter,
    setTagFilter,
    sortBy,
    setSortBy,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    availableTags,
    status,
    refetch,
    loading,
    selectedCustomerPurchasesStatus,
    selectedCustomerPurchasesError,
    refetchSelectedCustomer,
  } = useCustomers({ enabled });

  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<
    'All' | 'Completed' | 'Pending' | 'Refunded'
  >('All');

  const hasActiveFilters = Boolean(searchTerm || tagFilter);

  const purchases = useMemo(() => {
    const raw = selectedCustomer?.purchases ?? [];
    if (purchaseStatusFilter === 'All') return raw;
    return raw.filter(p => p.status === purchaseStatusFilter);
  }, [selectedCustomer?.purchases, purchaseStatusFilter]);

  if (!enabled) {
    return null;
  }

  if (loading && customers.length === 0 && status === 'loading') {
    return (
      <div className="p-6" data-testid="clients-analytics-panel">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="clients-analytics-panel">
      {clientsTruncated ? (
        <div
          role="status"
          data-testid="analytics-truncated-warning"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Client list is incomplete (over 1,000 records loaded partially).
          Analytics metrics reflect the loaded client collection and sales
          summaries for those clients only — not a complete organization census.
        </div>
      ) : null}

      <p className="text-sm text-gray-600" data-testid="analytics-scope-note">
        {clientsTruncated
          ? 'Showing spend and purchase metrics for the currently loaded client set.'
          : 'Showing spend and purchase metrics for clients in this organization.'}
      </p>

      <CustomerStats
        customers={customers}
        hasActiveFilters={hasActiveFilters}
        totalCustomers={allCustomersCount}
      />

      <CustomerSearch
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        availableTags={availableTags}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CustomerList
          customers={customers}
          selectedId={selectedCustomerId}
          onSelect={setSelectedCustomerId}
          status={status}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={() => {
            setSearchTerm('');
            setTagFilter(null);
          }}
          onRetry={refetch}
        />

        <div className="space-y-6">
          <CustomerDetail customer={selectedCustomer} />

          {selectedCustomer ? (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              {selectedCustomerPurchasesStatus === 'error' ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {selectedCustomerPurchasesError ||
                    'Failed to load purchase history.'}
                  <button
                    type="button"
                    onClick={refetchSelectedCustomer}
                    className="mt-2 block text-sm font-medium text-red-700 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <PurchaseHistory
                  purchases={purchases}
                  statusFilter={purchaseStatusFilter}
                  onStatusFilterChange={setPurchaseStatusFilter}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
