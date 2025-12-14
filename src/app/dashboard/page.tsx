'use client';

import { useDashboardModal } from './hooks/useDashboardModal';
import { useDashboardData } from './hooks/useDashboardData';
import { ItemForm, DashboardContent } from './components';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
} from '@/components/common';
import { usePageNotifications } from '@/hooks/usePageNotifications';
import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { Instrument, SalesHistory, Client, ClientInstrument } from '@/types';
import dynamic from 'next/dynamic';
import { useSalesHistory } from '@/app/sales/hooks/useSalesHistory';

// Dynamic import for SaleForm to reduce initial bundle size
const SaleForm = dynamic(() => import('@/app/sales/components/SaleForm'), {
  ssr: false,
});

export default function DashboardPage() {
  const { showSuccess, handleError } = useAppFeedback();

  // 판매 모달 상태
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedInstrumentForSale, setSelectedInstrumentForSale] =
    useState<Instrument | null>(null);
  const [selectedClientForSale, setSelectedClientForSale] =
    useState<Client | null>(null);

  // 판매 기록 생성
  const { createSale } = useSalesHistory();

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Page notifications (badge with click handler)
  // NOTE: Dashboard doesn't use maintenance tasks, so we pass empty array
  // Consider removing usePageNotifications from dashboard if notifications are not needed
  const { notificationBadge } = usePageNotifications({
    tasks: [], // Dashboard doesn't use maintenance tasks
    navigateTo: '/calendar',
    showToastOnClick: true,
    showSuccess,
  });

  // Dashboard data and CRUD operations
  const {
    instruments,
    clientRelationships,
    clients,
    loading,
    submitting,
    handleCreateItem,
    handleUpdateItem,
    handleUpdateItemInline,
    handleDeleteItem,
  } = useDashboardData();

  // FIXED: Use clients loading directly from useUnifiedDashboard
  const clientsLoading = loading.clients;

  // FIXED: Enrich items with clients array for HAS_CLIENTS filter
  // This ensures filterDashboardItems can properly check hasClients without type casting
  // FIXED: Use explicit ClientInstrument[] type instead of typeof clientRelationships
  type EnrichedInstrument = Instrument & {
    clients: ClientInstrument[];
  };
  const enrichedItems = useMemo<EnrichedInstrument[]>(() => {
    // Group relationships by instrument_id for O(1) lookup
    const relationshipsByInstrument = new Map<string, ClientInstrument[]>();
    clientRelationships.forEach((rel: ClientInstrument) => {
      if (rel.instrument_id) {
        const existing = relationshipsByInstrument.get(rel.instrument_id) || [];
        existing.push(rel);
        relationshipsByInstrument.set(rel.instrument_id, existing);
      }
    });

    // Map instruments with their clients
    return instruments.map((item: Instrument) => ({
      ...item,
      clients: relationshipsByInstrument.get(item.id) || [],
    })) as EnrichedInstrument[];
  }, [instruments, clientRelationships]);

  // Debug: Log clients loading state
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      console.log('[Dashboard] Clients state:', {
        clientsCount: clients?.length ?? 0,
        loading: loading.any,
        sampleClientIds:
          clients?.slice(0, 3).map((c: { id: string }) => c.id) ?? [],
        clientRelationshipsCount: clientRelationships?.length ?? 0,
        sampleRelationships:
          clientRelationships
            ?.slice(0, 3)
            .map((rel: (typeof clientRelationships)[number]) => ({
              instrument_id: rel.instrument_id,
              client_id: rel.client_id,
              relationship_type: rel.relationship_type,
              hasClient: !!rel.client,
              hasInstrument: !!rel.instrument,
            })) ?? [],
        enrichedItemsCount: enrichedItems.length,
        itemsWithClients: enrichedItems.filter(
          (i: EnrichedInstrument) => i.clients.length > 0
        ).length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clients?.length,
    loading.any,
    clientRelationships?.length,
    enrichedItems.length,
  ]);

  // Note: Dashboard filters are now handled in DashboardContent component
  // to support Suspense boundary for useSearchParams()

  // Dashboard modal state
  const {
    showModal,
    isEditing,
    selectedItem,
    closeModal,
    handleAddItem,
    confirmItem,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
  } = useDashboardModal();

  // FIXED: Calculate existing serial numbers as Set for O(1) lookup performance
  // This avoids duplicate data fetching in ItemForm (DashboardPage already has instruments)
  const existingSerialNumbersSet = useMemo(() => {
    return new Set(
      instruments
        .map((i: Instrument) => i.serial_number)
        .filter((n): n is string => !!n)
    );
  }, [instruments]);

  // Also provide as array for backwards compatibility (ItemForm/ItemList still use array)
  // TODO: Update validateInstrumentSerial to accept Set<string> for better performance
  const existingSerialNumbers = useMemo(
    () => Array.from(existingSerialNumbersSet),
    [existingSerialNumbersSet]
  );

  // Handle confirmed deletion
  const handleConfirmDelete = useCallback(async () => {
    if (!confirmItem) return;
    try {
      await handleDeleteItem(confirmItem.id);
      handleCancelDelete();
    } catch {
      // Error already handled in handleDeleteItem
    }
  }, [confirmItem, handleDeleteItem, handleCancelDelete]);

  // 원클릭 판매 핸들러
  const handleSellClick = useCallback(
    (item: Instrument) => {
      // 연결된 클라이언트 중 'Sold' 관계가 있는 클라이언트 찾기
      const soldClient = clientRelationships.find(
        rel => rel.instrument_id === item.id && rel.relationship_type === 'Sold'
      )?.client;

      setSelectedInstrumentForSale(item);
      setSelectedClientForSale(soldClient || null);
      setShowSaleModal(true);
    },
    [clientRelationships]
  );

  // 판매 기록 저장 핸들러
  const handleSaleSubmit = useCallback(
    async (payload: Omit<SalesHistory, 'id' | 'created_at'>) => {
      try {
        const result = await createSale(payload);
        if (result) {
          showSuccess('판매 기록이 성공적으로 생성되었습니다.');
          setShowSaleModal(false);
          setSelectedInstrumentForSale(null);
          setSelectedClientForSale(null);
        }
      } catch (error) {
        handleError(error, '판매 기록 생성 실패');
      }
    },
    [createSale, showSuccess, handleError]
  );

  return (
    <ErrorBoundary>
      <AppLayout
        title="Dashboard"
        actionButton={{
          label: 'Add Item',
          onClick: handleAddItem,
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          ),
        }}
        headerActions={
          <NotificationBadge
            overdue={notificationBadge.overdue}
            upcoming={notificationBadge.upcoming}
            today={notificationBadge.today}
            onClick={notificationBadge.onClick}
          />
        }
      >
        <DashboardContent
          enrichedItems={enrichedItems}
          clients={clients}
          clientRelationships={clientRelationships}
          clientsLoading={clientsLoading}
          loading={loading}
          onDeleteClick={handleRequestDelete}
          onUpdateItemInline={handleUpdateItemInline}
          onAddClick={handleAddItem}
          onSellClick={handleSellClick}
          existingSerialNumbers={existingSerialNumbers}
        />

        {/* Item Form Modal - Show when editing or creating */}
        {/* Note: Form state management is handled internally by ItemForm via useDashboardForm.
            ItemForm handles form reset and modal close on successful submit. */}
        <ItemForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={
            isEditing && selectedItem
              ? async formData => {
                  await handleUpdateItem(selectedItem.id, formData);
                }
              : handleCreateItem
          }
          submitting={submitting.any}
          selectedItem={selectedItem}
          isEditing={isEditing}
          existingSerialNumbers={existingSerialNumbers}
        />

        <ConfirmDialog
          isOpen={isConfirmDialogOpen}
          title="Delete item?"
          message="This item will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />

        {/* Sale Form Modal - 원클릭 판매 */}
        <SaleForm
          isOpen={showSaleModal}
          onClose={() => {
            setShowSaleModal(false);
            setSelectedInstrumentForSale(null);
            setSelectedClientForSale(null);
          }}
          onSubmit={handleSaleSubmit}
          submitting={submitting.any}
          initialInstrument={selectedInstrumentForSale}
          initialClient={selectedClientForSale}
          autoUpdateInstrumentStatus={true}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
