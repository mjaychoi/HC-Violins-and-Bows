'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CustomerStats } from '../analytics/components/CustomerStats';
import { CustomerSearch } from '../analytics/components/CustomerSearch';
import { CustomerList } from '../analytics/components/CustomerList';
import { CustomerDetail } from '../analytics/components/CustomerDetail';
import { PurchaseHistory } from '../analytics/components/PurchaseHistory';
import { useCustomers } from '../analytics/hooks/useCustomers';
import { TableSkeleton } from '@/components/common';
import { apiFetch } from '@/utils/apiFetch';
import { readApiResponseEnvelope } from '@/utils/handleApiResponse';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import type { ClientsAnalyticsSummary } from '@/app/api/clients/analytics/route';

interface ClientsAnalyticsPanelProps {
  /** When false, analytics fetches are disabled (list tab active). */
  enabled: boolean;
}

/**
 * Canonical analytics view for `/clients?tab=analytics`.
 * Organization-wide metrics come from GET /api/clients/analytics (complete census).
 * The customer list still uses sales summary joined with directory clients for
 * browse/detail; list pagination on the main tab does not change these metrics.
 */
export default function ClientsAnalyticsPanel({
  enabled,
}: ClientsAnalyticsPanelProps) {
  const { tenantIdentityKey } = useTenantIdentity();
  const [orgSummary, setOrgSummary] = useState<ClientsAnalyticsSummary | null>(
    null
  );
  const [orgSummaryStatus, setOrgSummaryStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const summaryRequestRef = useRef(0);

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

  const fetchOrgSummary = useCallback(async () => {
    const startedTenant = tenantIdentityKey;
    const requestId = ++summaryRequestRef.current;
    setOrgSummaryStatus('loading');
    try {
      const res = await apiFetch('/api/clients/analytics');
      const body = await readApiResponseEnvelope<ClientsAnalyticsSummary>(
        res,
        'Failed to load analytics summary'
      );
      if (
        requestId !== summaryRequestRef.current ||
        startedTenant !== tenantIdentityKey
      ) {
        return;
      }
      setOrgSummary(body.data ?? null);
      setOrgSummaryStatus('success');
    } catch {
      if (
        requestId !== summaryRequestRef.current ||
        startedTenant !== tenantIdentityKey
      ) {
        return;
      }
      setOrgSummary(null);
      setOrgSummaryStatus('error');
    }
  }, [tenantIdentityKey]);

  useEffect(() => {
    if (!enabled) return;
    void fetchOrgSummary();
  }, [enabled, fetchOrgSummary, tenantIdentityKey]);

  const purchases = useMemo(() => {
    const raw = selectedCustomer?.purchases ?? [];
    if (purchaseStatusFilter === 'All') return raw;
    return raw.filter(p => p.status === purchaseStatusFilter);
  }, [selectedCustomer?.purchases, purchaseStatusFilter]);

  if (!enabled) {
    return null;
  }

  if (
    (loading && customers.length === 0 && status === 'loading') ||
    (orgSummaryStatus === 'loading' && !orgSummary)
  ) {
    return (
      <div className="p-6" data-testid="clients-analytics-panel-loading">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="clients-analytics-panel">
      <p className="text-sm text-gray-600" data-testid="analytics-scope-note">
        Showing organization-wide spend and purchase metrics for this
        organization. Changing the clients list page does not alter these
        totals.
      </p>

      {orgSummaryStatus === 'error' ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3"
        >
          <span>Could not load complete organization analytics.</span>
          <button
            type="button"
            className="underline font-medium"
            onClick={() => void fetchOrgSummary()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <CustomerStats
        customers={customers}
        hasActiveFilters={hasActiveFilters}
        totalCustomers={
          hasActiveFilters
            ? allCustomersCount
            : (orgSummary?.customerCount ?? allCustomersCount)
        }
        summaryOverride={
          hasActiveFilters
            ? null
            : orgSummary
              ? {
                  customerCount: orgSummary.customerCount,
                  totalSpend: orgSummary.totalSpend,
                  avgSpendPerCustomer: orgSummary.avgSpendPerCustomer,
                  purchaseCount: orgSummary.purchaseCount,
                  mostRecentPurchaseDate: orgSummary.mostRecentPurchaseDate,
                }
              : null
        }
      />

      {hasActiveFilters ? (
        <p
          className="text-xs text-gray-500"
          data-testid="analytics-filter-note"
        >
          Customer browser filters apply to the list below. Organization-wide
          metrics remain available when filters are cleared.
        </p>
      ) : null}

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
          onRetry={() => {
            void refetch();
            void fetchOrgSummary();
          }}
        />

        <div className="space-y-4">
          <CustomerDetail customer={selectedCustomer} />
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            {selectedCustomerPurchasesStatus === 'error' ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {selectedCustomerPurchasesError ||
                  'Failed to load purchase history.'}
                <button
                  type="button"
                  onClick={() => void refetchSelectedCustomer()}
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
        </div>
      </div>
    </div>
  );
}
