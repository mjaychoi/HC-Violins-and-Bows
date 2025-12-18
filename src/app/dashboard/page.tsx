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
import { generateSampleInstruments } from './utils/sampleData';
import TodayFollowUps from '@/app/clients/components/TodayFollowUps';

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

  // 최근 거래한 클라이언트 ID 리스트 (판매 기록 기반)
  const [recentClientIds, setRecentClientIds] = useState<string[]>([]);

  // 판매 기록을 가져와서 최근 거래 클라이언트 ID 계산
  useEffect(() => {
    const fetchRecentClients = async () => {
      try {
        // 최근 100개의 판매 기록을 가져와서 클라이언트 ID 추출
        const response = await fetch(
          '/api/sales?page=1&pageSize=100&sortColumn=sale_date&sortDirection=desc'
        );
        const result = await response.json();

        if (response.ok && result.data) {
          const sales = result.data as SalesHistory[];
          // sale_date 기준으로 정렬되어 있으므로, client_id를 순서대로 추출
          // 중복 제거하면서 순서 유지 (가장 최근 거래만 유지)
          const seen = new Set<string>();
          const clientIds: string[] = [];

          for (const sale of sales) {
            if (sale.client_id && !seen.has(sale.client_id)) {
              seen.add(sale.client_id);
              clientIds.push(sale.client_id);
            }
          }

          setRecentClientIds(clientIds);
        }
      } catch (error) {
        // 에러는 무시 (최근 클라이언트는 선택적 기능)
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch recent clients:', error);
        }
      }
    };

    // 판매 모달이 열릴 때만 가져오도록 최적화
    if (showSaleModal) {
      fetchRecentClients();
    }
  }, [showSaleModal]);

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
        loading: loading.hasAnyLoading,
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
    loading.hasAnyLoading,
    clientRelationships?.length,
    enrichedItems.length,
  ]);

  // Note: Dashboard filters are now handled in DashboardContent component
  // to support Suspense boundary for useSearchParams()

  // Dashboard modal state
  const {
    isModalOpen,
    isEditing,
    selectedItem,
    closeModal,
    handleAddItem,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
    handleConfirmDelete: handleConfirmDeleteFromHook,
  } = useDashboardModal({
    onDelete: handleDeleteItem,
  });

  // Track newly created item for scroll/highlight feedback
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState<string | null>(
    null
  );

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

  // ✅ FIXED: handleConfirmDelete는 이제 훅에서 제공됨
  const handleConfirmDelete = handleConfirmDeleteFromHook;

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
    async (
      payload: Omit<SalesHistory, 'id' | 'created_at'>,
      options?: { instrumentStatusUpdated?: boolean; instrumentId?: string }
    ) => {
      try {
        const result = await createSale(payload);
        if (result) {
          // 작업 완료 요약 메시지 생성
          const messages: string[] = ['판매 기록이 추가되었습니다'];
          const links: Array<{ label: string; href: string }> = [];

          if (options?.instrumentStatusUpdated && options?.instrumentId) {
            messages.push("악기 상태가 'Sold'로 변경되었습니다");
            links.push({
              label: '악기 보기',
              href: `/dashboard?instrumentId=${options.instrumentId}`,
            });
          }

          const message = messages.join('고, ');
          showSuccess(message + '.', links.length > 0 ? links : undefined);
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

  // 예시 데이터 로드 핸들러
  const handleLoadSampleData = useCallback(async () => {
    try {
      const sampleInstruments = generateSampleInstruments(
        existingSerialNumbers
      );
      let successCount = 0;
      let errorCount = 0;

      for (const instrument of sampleInstruments) {
        try {
          await handleCreateItem(instrument);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error('Failed to create sample instrument:', error);
        }
      }

      if (successCount > 0) {
        showSuccess(
          `예시 데이터 ${successCount}개가 성공적으로 추가되었습니다.`
        );
      }
      if (errorCount > 0) {
        handleError(
          new Error(`일부 예시 데이터 추가에 실패했습니다 (${errorCount}개)`),
          '예시 데이터 로드'
        );
      }
    } catch (error) {
      handleError(error, '예시 데이터 로드 실패');
    }
  }, [existingSerialNumbers, handleCreateItem, showSuccess, handleError]);

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
        {/* 오늘/지연된 Follow-up 요약 카드 */}
        <div className="px-6 pt-6">
          <TodayFollowUps />
        </div>

        <DashboardContent
          enrichedItems={enrichedItems}
          clients={clients}
          clientRelationships={clientRelationships}
          clientsLoading={clientsLoading}
          loading={loading}
          onDeleteClick={item => handleRequestDelete(item.id)}
          onUpdateItemInline={handleUpdateItemInline}
          onAddClick={handleAddItem}
          onSellClick={handleSellClick}
          existingSerialNumbers={existingSerialNumbers}
          newlyCreatedItemId={newlyCreatedItemId}
          onNewlyCreatedItemShown={() => setNewlyCreatedItemId(null)}
          onLoadSampleData={handleLoadSampleData}
        />

        {/* Item Form Modal - Show when editing or creating */}
        {/* Note: Form state management is handled internally by ItemForm via useDashboardForm.
            ItemForm handles form reset and modal close on successful submit. */}
        <ItemForm
          isOpen={isModalOpen}
          onClose={closeModal}
          onSubmit={
            isEditing && selectedItem
              ? async formData => {
                  await handleUpdateItem(selectedItem.id, formData);

                  // UX: Show which item was updated
                  const titleParts = [
                    formData.maker ?? undefined,
                    formData.type ?? undefined,
                  ].filter(Boolean);
                  const label =
                    (titleParts.length > 0 ? titleParts.join(' - ') : '악기') +
                    '이(가)';
                  showSuccess(`"${label}" 수정되었습니다.`);
                }
              : async formData => {
                  const createdId = await handleCreateItem(formData);
                  if (createdId) {
                    setNewlyCreatedItemId(createdId);

                    // UX: Show which item was created
                    const titleParts = [
                      formData.maker ?? undefined,
                      formData.type ?? undefined,
                    ].filter(Boolean);
                    const label =
                      (titleParts.length > 0
                        ? titleParts.join(' - ')
                        : '새 악기') + '이(가)';
                    showSuccess(`"${label}" 추가되었습니다.`);
                  }
                }
          }
          submitting={submitting.hasAnySubmitting}
          selectedItem={selectedItem}
          isEditing={isEditing}
          existingSerialNumbers={existingSerialNumbers}
          instruments={instruments}
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
          submitting={submitting.hasAnySubmitting}
          initialInstrument={selectedInstrumentForSale}
          initialClient={selectedClientForSale}
          autoUpdateInstrumentStatus={true}
          recentClientIds={recentClientIds}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
