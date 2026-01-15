'use client';

import React, { useCallback, useMemo, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
} from '@/components/common';

import { useAppFeedback } from '@/hooks/useAppFeedback';

import { useDashboardModal } from './hooks/useDashboardModal';
import { useDashboardData } from './hooks/useDashboardData';
import { ItemForm, DashboardContent } from './components';

import { useSalesHistory } from '@/app/sales/hooks/useSalesHistory';
import { generateSampleInstruments } from './utils/sampleData';
import { logDebug } from '@/utils/logger';

import type {
  Instrument,
  SalesHistory,
  Client,
  ClientInstrument,
} from '@/types';

type InstrumentFormData = Omit<Instrument, 'id' | 'created_at'>;

// Dynamic import for SaleForm to reduce initial bundle size
const SaleForm = dynamic(() => import('@/app/sales/components/SaleForm'), {
  ssr: false,
});

type EnrichedInstrument = Instrument & { clients: ClientInstrument[] };

export default function DashboardPage() {
  const { showSuccess, handleError } = useAppFeedback();

  // --- Sale modal state ---
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedInstrumentForSale, setSelectedInstrumentForSale] =
    useState<Instrument | null>(null);
  const [selectedClientForSale, setSelectedClientForSale] =
    useState<Client | null>(null);

  const { createSale } = useSalesHistory();

  // 최근 거래한 클라이언트 ID 리스트
  const [recentClientIds, setRecentClientIds] = useState<string[]>([]);
  const [recentClientsLoaded, setRecentClientsLoaded] = useState(false); // ✅ 캐시 플래그

  // --- Dashboard data and CRUD operations ---
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

  const clientsLoading = loading.clients;

  // ✅ 개선 1) enrichedItems: 캐스팅 제거 + O(1) map
  const enrichedItems = useMemo<EnrichedInstrument[]>(() => {
    const byInstrument = new Map<string, ClientInstrument[]>();

    for (const rel of clientRelationships) {
      const instrumentId = rel.instrument_id;
      if (!instrumentId) continue;

      const arr = byInstrument.get(instrumentId) ?? [];
      arr.push(rel);
      byInstrument.set(instrumentId, arr);
    }

    return instruments.map(item => ({
      ...item,
      clients: byInstrument.get(item.id) ?? [],
    }));
  }, [instruments, clientRelationships]);

  // ✅ 개선 2) Dashboard에 tasks가 없어서 usePageNotifications 제거
  // 필요하면 나중에 Calendar/Tasks 있는 페이지에서만 badge 쓰는 게 더 깔끔
  const notificationBadge = useMemo(
    () => ({
      overdue: 0,
      upcoming: 0,
      today: 0,
      onClick: () => {
        // no-op (dashboard에서는 사용 안 함)
      },
    }),
    []
  );

  // ✅ 개선 3) 최근 거래 클라이언트 fetch: AbortController + 모달 열릴 때만 + 1회 캐시
  useEffect(() => {
    if (!showSaleModal) return;
    if (recentClientsLoaded) return;

    const ac = new AbortController();

    (async () => {
      try {
        const url =
          '/api/sales?page=1&pageSize=100&sortColumn=sale_date&sortDirection=desc';
        const response = await fetch(url, { signal: ac.signal });

        if (!response.ok) {
          // 선택 기능이라 에러는 조용히 무시 (dev만 로그)
          if (process.env.NODE_ENV === 'development') {
            console.error(
              'Failed to fetch recent clients:',
              response.status,
              response.statusText
            );
          }
          return;
        }

        const result = (await response.json()) as { data?: SalesHistory[] };

        const sales = Array.isArray(result.data) ? result.data : [];
        const seen = new Set<string>();
        const ids: string[] = [];

        for (const sale of sales) {
          const id = sale.client_id;
          if (!id) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          ids.push(id);
        }

        setRecentClientIds(ids);
        setRecentClientsLoaded(true);
      } catch (err) {
        // Abort는 정상 흐름
        if ((err as { name?: string })?.name === 'AbortError') return;

        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch recent clients:', err);
        }
      }
    })();

    return () => ac.abort();
  }, [showSaleModal, recentClientsLoaded]);

  // ✅ serial number set (O(1))
  const existingSerialNumbersSet = useMemo(() => {
    const s = new Set<string>();
    for (const i of instruments) {
      if (i.serial_number) s.add(i.serial_number);
    }
    return s;
  }, [instruments]);

  const existingSerialNumbers = useMemo(
    () => Array.from(existingSerialNumbersSet),
    [existingSerialNumbersSet]
  );

  // --- Dashboard modal state ---
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
  } = useDashboardModal({ onDelete: handleDeleteItem });

  const handleConfirmDelete = handleConfirmDeleteFromHook;

  // Track newly created item for scroll/highlight feedback
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState<string | null>(
    null
  );

  // ✅ onSubmit 함수들: inline 생성 줄이고, 로직을 callback으로 분리
  const handleSubmitCreate = useCallback(
    async (formData: InstrumentFormData) => {
      const createdId = await handleCreateItem(formData);
      if (!createdId) return;

      setNewlyCreatedItemId(createdId);

      const titleParts = [
        formData.maker ?? undefined,
        formData.type ?? undefined,
      ].filter(Boolean);
      const label =
        (titleParts.length > 0 ? titleParts.join(' - ') : '새 악기') + '이(가)';
      showSuccess(`"${label}" 추가되었습니다.`);
    },
    [handleCreateItem, showSuccess]
  );

  const handleSubmitUpdate = useCallback(
    async (id: string, formData: Partial<InstrumentFormData>) => {
      await handleUpdateItem(id, formData);

      const titleParts = [
        formData.maker ?? undefined,
        formData.type ?? undefined,
      ].filter(Boolean);
      const label =
        (titleParts.length > 0 ? titleParts.join(' - ') : '악기') + '이(가)';
      showSuccess(`"${label}" 수정되었습니다.`);
    },
    [handleUpdateItem, showSuccess]
  );

  // 판매 기록 저장 핸들러
  const handleSaleSubmit = useCallback(
    async (
      payload: Omit<SalesHistory, 'id' | 'created_at'>,
      options?: { instrumentStatusUpdated?: boolean; instrumentId?: string }
    ) => {
      try {
        const result = await createSale(payload);
        if (!result) return;

        const messages: string[] = ['판매 기록이 추가되었습니다'];
        const links: Array<{ label: string; href: string }> = [];

        if (options?.instrumentStatusUpdated && options?.instrumentId) {
          messages.push("악기 상태가 'Sold'로 변경되었습니다");
          links.push({
            label: '악기 보기',
            href: `/dashboard?instrumentId=${options.instrumentId}`,
          });
        }

        // 한국어 문장 합치기: join(' / ') 같이 중립 구분자 추천
        const message = messages.join(' / ');
        showSuccess(message + '.', links.length > 0 ? links : undefined);

        setShowSaleModal(false);
        setSelectedInstrumentForSale(null);
        setSelectedClientForSale(null);
      } catch (error) {
        handleError(error, '판매 기록 생성 실패');
      }
    },
    [createSale, showSuccess, handleError]
  );

  const handleItemFormSubmit = useCallback(
    async (formData: Partial<InstrumentFormData>) => {
      if (isEditing && selectedItem) {
        return handleSubmitUpdate(selectedItem.id, formData);
      }
      return handleSubmitCreate(formData as InstrumentFormData);
    },
    [isEditing, selectedItem, handleSubmitUpdate, handleSubmitCreate]
  );

  // 예시 데이터 로드 핸들러 (sequential 유지, 필요하면 나중에 병렬/배치로)
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
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to create sample instrument:', error);
          }
        }
      }

      if (successCount > 0) {
        showSuccess(
          `예시 데이터 ${successCount}개가 성공적으로 추가되었습니다.`
        );
      }
      if (errorCount > 0) {
        handleError(
          new Error(`일부 예시 데이터 추가 실패 (${errorCount}개)`),
          '예시 데이터 로드'
        );
      }
    } catch (error) {
      handleError(error, '예시 데이터 로드 실패');
    }
  }, [existingSerialNumbers, handleCreateItem, showSuccess, handleError]);

  // dev debug
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    logDebug('[Dashboard] state snapshot', {
      clientsCount: clients?.length ?? 0,
      hasAnyLoading: loading.hasAnyLoading,
      relationshipsCount: clientRelationships?.length ?? 0,
      enrichedItemsCount: enrichedItems.length,
      itemsWithClients: enrichedItems.filter(i => i.clients.length > 0).length,
    });
  }, [
    clients?.length,
    loading.hasAnyLoading,
    clientRelationships?.length,
    enrichedItems,
    clients,
  ]);

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
          onDeleteClick={item => handleRequestDelete(item.id)}
          onUpdateItemInline={handleUpdateItemInline}
          onAddClick={handleAddItem}
          newlyCreatedItemId={newlyCreatedItemId}
          onNewlyCreatedItemShown={() => setNewlyCreatedItemId(null)}
          onLoadSampleData={handleLoadSampleData}
        />

        <ItemForm
          isOpen={isModalOpen}
          onClose={closeModal}
          onSubmit={handleItemFormSubmit}
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
