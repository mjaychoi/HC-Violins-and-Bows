'use client';

import React, { useCallback, useMemo, useEffect, useState } from 'react';

import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
} from '@/components/common';

import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import { normalizeUnifiedResourceErrors } from '@/hooks/unifiedResourceErrors';

import { useDashboardModal } from './hooks/useDashboardModal';
import { useDashboardData } from './hooks/useDashboardData';
import { ItemForm, DashboardContent } from './components';
import InstrumentModal from './components/InstrumentModal';

import { logDebug } from '@/utils/logger';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

import type { Instrument, ClientInstrument } from '@/types';

type InstrumentFormData = Omit<Instrument, 'id' | 'created_at'>;

type EnrichedInstrument = Instrument & { clients: ClientInstrument[] };

export default function DashboardPage() {
  const { showSuccess, handleError } = useAppFeedback();
  const { canCreateInstrument, createInstrumentDisabledReason } =
    usePermissions();
  const { tenantIdentityKey } = useTenantIdentity();

  // --- Details modal (images + certificates) ---
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsModalInstrument, setDetailsModalInstrument] =
    useState<Instrument | null>(null);

  const openDetailsModal = useCallback((item: Instrument) => {
    setDetailsModalInstrument(item);
    setDetailsModalOpen(true);
  }, []);

  const closeDetailsModal = useCallback(() => {
    setDetailsModalOpen(false);
  }, []);

  // --- Dashboard data and CRUD operations ---
  const {
    instruments,
    allInstrumentResultsTruncated,
    clientRelationships,
    clients,
    loading,
    errors,
    submitting,
    hasFatalError,
    handleCreateItem,
    handleUpdateItem,
    handleUpdateItemInline,
    handleDeleteItem,
    reloadDashboard,
  } = useDashboardData();

  const safeErrors = useMemo(
    () => normalizeUnifiedResourceErrors(errors),
    [errors]
  );

  const clientsLoading = loading.clients;

  // Two-tier error model:
  //   hasFatalError — instruments failed; whole dashboard is unusable.
  //   hasSecondaryError — clients or connections failed but instruments loaded.
  const hasSecondaryError =
    !hasFatalError &&
    (Boolean(safeErrors?.clients) || Boolean(safeErrors?.connections)) &&
    !loading.hasAnyLoading;

  const dashboardErrorMessage = useMemo(() => {
    const err = safeErrors?.instruments;

    if (err instanceof Error && err.message) return err.message;

    if (
      err &&
      typeof err === 'object' &&
      'message' in err &&
      typeof (err as { message?: unknown }).message === 'string'
    ) {
      return (err as { message: string }).message;
    }

    return 'Failed to load dashboard data.';
  }, [safeErrors]);

  const secondaryErrorMessage = useMemo(() => {
    const parts: string[] = [];

    if (safeErrors?.clients) parts.push('client data');
    if (safeErrors?.connections) parts.push('instrument–client relationships');

    if (parts.length === 0) return null;

    return `Some data could not be loaded: ${parts.join(
      ' and '
    )}. Some features may be limited.`;
  }, [safeErrors]);

  // enrichedItems: O(1) client lookup per instrument
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

  // Dashboard has no tasks — notification badge is a no-op placeholder
  const notificationBadge = useMemo(
    () => ({
      overdue: 0,
      upcoming: 0,
      today: 0,
      onClick: () => {
        // no-op
      },
    }),
    []
  );

  const existingSerialNumbersSet = useMemo(() => {
    const serialNumbers = new Set<string>();

    for (const instrument of instruments) {
      if (instrument.serial_number) {
        serialNumbers.add(instrument.serial_number);
      }
    }

    return serialNumbers;
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
    openEditModal,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
    handleConfirmDelete: handleConfirmDeleteFromHook,
  } = useDashboardModal({
    onDelete: handleDeleteItem,
    onDeleteError: error => handleError(error, 'Failed to delete item'),
    hasFatalError,
  });

  const handleConfirmDelete = handleConfirmDeleteFromHook;

  // Track newly created item for scroll/highlight feedback
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState<string | null>(
    null
  );

  useEffect(() => {
    setNewlyCreatedItemId(null);
  }, [tenantIdentityKey]);

  const handleSubmitCreate = useCallback(
    async (formData: InstrumentFormData) => {
      if (hasFatalError) {
        throw new Error(
          'Dashboard failed to load — retry before making changes'
        );
      }

      const created = await handleCreateItem(formData);
      setNewlyCreatedItemId(created.id);

      const titleParts = [
        formData.maker ?? undefined,
        formData.type ?? undefined,
      ].filter(Boolean);

      const label = titleParts.length > 0 ? titleParts.join(' - ') : 'New item';
      showSuccess(`"${label}" has been added.`);

      return created;
    },
    [handleCreateItem, showSuccess, hasFatalError]
  );

  const handleSubmitUpdate = useCallback(
    async (id: string, formData: Partial<InstrumentFormData>) => {
      if (hasFatalError) {
        throw new Error(
          'Dashboard failed to load — retry before making changes'
        );
      }

      const result = await handleUpdateItem(id, formData);

      const titleParts = [
        formData.maker ?? undefined,
        formData.type ?? undefined,
      ].filter(Boolean);

      const label = titleParts.length > 0 ? titleParts.join(' - ') : 'Item';
      showSuccess(`"${label}" has been updated.`);

      return result;
    },
    [handleUpdateItem, showSuccess, hasFatalError]
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

  // dev debug
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    logDebug('[Dashboard] state snapshot', {
      clientsCount: clients?.length ?? 0,
      hasAnyLoading: loading.hasAnyLoading,
      relationshipsCount: clientRelationships?.length ?? 0,
      enrichedItemsCount: enrichedItems.length,
      itemsWithClients: enrichedItems.filter(item => item.clients.length > 0)
        .length,
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
        hideSidebar={isModalOpen || detailsModalOpen}
        actionButton={
          canCreateInstrument || createInstrumentDisabledReason
            ? {
                label: 'Add Item',
                onClick: canCreateInstrument
                  ? handleAddItem
                  : () => {
                      /* disabled — see disabledReason */
                    },
                disabled:
                  !canCreateInstrument ||
                  submitting.hasAnySubmitting ||
                  hasFatalError,
                disabledReason: hasFatalError
                  ? 'Dashboard failed to load — retry before making changes'
                  : !canCreateInstrument
                    ? createInstrumentDisabledReason
                    : submitting.hasAnySubmitting
                      ? 'Please wait for the current submission to finish'
                      : undefined,
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
              }
            : undefined
        }
        headerActions={
          <div className="flex items-center gap-2">
            <NotificationBadge
              overdue={notificationBadge.overdue}
              upcoming={notificationBadge.upcoming}
              today={notificationBadge.today}
              onClick={notificationBadge.onClick}
            />
          </div>
        }
      >
        {hasFatalError ? (
          <div className="p-6">
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-red-200 bg-red-50 p-6"
            >
              <h2 className="text-lg font-semibold text-red-900">
                Failed to load dashboard
              </h2>
              <p className="mt-2 text-sm text-red-800">
                {dashboardErrorMessage}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void reloadDashboard()}
                  className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {hasSecondaryError && secondaryErrorMessage && (
              <div
                role="status"
                aria-live="polite"
                className="mx-6 mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
              >
                {secondaryErrorMessage}
              </div>
            )}

            <DashboardContent
              enrichedItems={enrichedItems}
              itemsTruncated={allInstrumentResultsTruncated}
              clients={clients}
              clientRelationships={clientRelationships}
              clientsLoading={clientsLoading}
              loading={loading}
              onDeleteClick={item => handleRequestDelete(item.id)}
              onEditClick={openEditModal}
              onRowClick={openDetailsModal}
              onUpdateItemInline={handleUpdateItemInline}
              onAddClick={canCreateInstrument ? handleAddItem : undefined}
              newlyCreatedItemId={newlyCreatedItemId}
              onNewlyCreatedItemShown={() => setNewlyCreatedItemId(null)}
              onInstrumentCertificatesChanged={() => void reloadDashboard()}
            />
          </>
        )}

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

        {!hasFatalError && (
          <ConfirmDialog
            isOpen={isConfirmDialogOpen}
            title="Delete item?"
            message="This item will be permanently removed. This action cannot be undone."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            submitting={submitting.hasAnySubmitting}
            submittingLabel="Deleting..."
          />
        )}

        <InstrumentModal
          isOpen={detailsModalOpen}
          onClose={closeDetailsModal}
          instrument={detailsModalInstrument}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
