'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { normalizeUnifiedResourceErrors } from '@/hooks/unifiedResourceErrors';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useToast } from '@/contexts/ToastContext';
import { format } from 'date-fns';
import { evaluateSalePriceNumber } from '@/utils/salePriceRules';

type DashboardSaleTransition = {
  sale_price?: number | null;
  sale_date?: string | null;
  client_id?: string | null;
  sales_note?: string | null;
};

export const useDashboardData = () => {
  const { showSuccess } = useToast();
  const { withSubmitting } = useLoadingState();

  const {
    instruments,
    allInstrumentResultsTruncated,
    allInstrumentResultsTotalCount,
    allInstrumentResultsLoadedCount,
    clients,
    loading,
    errors,
    submitting,
    clientRelationships,
    fetchClients,
    fetchInstruments,
    fetchConnections,
    createInstrument,
    updateInstrument,
    deleteInstrument,
  } = useUnifiedDashboard();

  const createIdempotencyKeyRef = useRef<string | null>(null);

  const safeErrors = useMemo(
    () => normalizeUnifiedResourceErrors(errors),
    [errors]
  );

  // Primary-source fatal error: instruments fetch confirmed failed.
  // SET_ERROR(null) clears this at retry start, so no loading guard is needed —
  // secondary source loading states must not suppress this signal.
  const hasFatalError = Boolean(safeErrors?.instruments);

  // Optimized: Create Maps for O(1) lookups instead of O(n) find operations
  const instrumentMap = useMemo(
    () =>
      new Map(
        instruments.map((instrument: Instrument) => [instrument.id, instrument])
      ),
    [instruments]
  );

  // FIXED: Use explicit ClientInstrument type instead of typeof clientRelationships[0]
  const soldConnectionsMap = useMemo(() => {
    const map = new Map<string, ClientInstrument>();
    clientRelationships.forEach(
      (conn: ClientInstrument & { client?: unknown; instrument?: unknown }) => {
        if (conn.relationship_type === 'Sold' && conn.instrument_id) {
          map.set(conn.instrument_id, conn);
        }
      }
    );
    return map;
  }, [clientRelationships]);

  // Handle item creation
  const handleCreateItem = useCallback(
    async (formData: Omit<Instrument, 'id' | 'created_at'>) => {
      if (hasFatalError) {
        throw new Error(
          'Dashboard failed to load — retry before making changes'
        );
      }
      return await withSubmitting(async () => {
        if (!createIdempotencyKeyRef.current) {
          createIdempotencyKeyRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        const idempotencyKey = createIdempotencyKeyRef.current;
        try {
          const result = await createInstrument(formData, { idempotencyKey });
          if (!result?.id) {
            throw new Error('Instrument creation failed');
          }
          return result;
        } finally {
          createIdempotencyKeyRef.current = null;
        }
      });
    },
    [hasFatalError, createInstrument, withSubmitting]
  );

  // Handle item update
  const handleUpdateItem = useCallback(
    async (
      itemId: string,
      formData: Partial<Omit<Instrument, 'id' | 'created_at'>>
    ) => {
      if (hasFatalError) {
        throw new Error(
          'Dashboard failed to load — retry before making changes'
        );
      }

      // Cache is optional convenience only (CAS updated_at, price hint, same-status
      // suppression). It is never authoritative for previous status — the server RPC
      // compares the DB row. Map membership must not gate sale_transition.
      const cachedInstrument = instrumentMap.get(itemId) as
        | Instrument
        | undefined;
      const cachedStatus = cachedInstrument?.status;

      const nextStatus = formData.status; // possibly undefined
      // Dirty drafts must keep their frozen CAS token. Only callers that omit
      // updated_at (inline edits) may fall back to the collection cache.
      const baseUpdatedAt = Object.prototype.hasOwnProperty.call(
        formData,
        'updated_at'
      )
        ? formData.updated_at
        : cachedInstrument?.updated_at;

      let updatePayload: Partial<Omit<Instrument, 'id' | 'created_at'>> & {
        sale_transition?: DashboardSaleTransition;
      } = { ...formData, updated_at: baseUpdatedAt };

      // No status in the request → ordinary field edit, never a sale lifecycle.
      if (nextStatus === undefined) {
        return await updateInstrument(itemId, updatePayload);
      }

      if (nextStatus === 'Sold') {
        // Skip only when cache confirms already Sold (same-status metadata edit).
        // On cache miss, still send transition — server no-ops if already Sold.
        if (cachedStatus !== 'Sold') {
          const rawPrice =
            formData.price !== undefined && formData.price !== null
              ? Number(formData.price)
              : cachedInstrument?.price !== undefined &&
                  cachedInstrument.price !== null
                ? Number(cachedInstrument.price)
                : null;

          if (typeof rawPrice !== 'number' || Number.isNaN(rawPrice)) {
            throw new Error(
              'Sale price is required when marking an instrument as Sold.'
            );
          }

          // Early client-side feedback only — the server (executeInstrumentPatch)
          // re-validates with the same rules and remains authoritative.
          const priceValidation = evaluateSalePriceNumber(rawPrice, {
            requirePositive: true,
          });

          if (!priceValidation.ok) {
            throw new Error(priceValidation.message);
          }

          const soldConnection = soldConnectionsMap.get(itemId);

          updatePayload = {
            ...formData,
            updated_at: baseUpdatedAt,
            sale_transition: {
              sale_price: Number(priceValidation.amountDecimal),
              sale_date: format(new Date(), 'yyyy-MM-dd'),
              client_id: soldConnection?.client_id || null,
              sales_note: 'Auto-created when instrument status changed to Sold',
            },
          };
        }
      } else if (cachedStatus === 'Sold' || cachedInstrument === undefined) {
        // Leaving Sold, or cache miss with a non-Sold target: attach unsell
        // transition. Server no-ops when the row is not currently Sold.
        // When cache shows a non-Sold status, this is an ordinary status edit.
        updatePayload = {
          ...formData,
          updated_at: baseUpdatedAt,
          sale_transition: {
            sales_note: `Auto-refunded when instrument status changed from Sold to ${
              nextStatus || 'Available'
            } on ${format(new Date(), 'yyyy-MM-dd')}`,
          },
        };
      }

      return await updateInstrument(
        itemId,
        updatePayload as Partial<Instrument>
      );
    },
    [hasFatalError, updateInstrument, instrumentMap, soldConnectionsMap]
  );

  // Handle item update for inline editing (returns void)
  const handleUpdateItemInline = useCallback(
    async (
      itemId: string,
      formData: Partial<Omit<Instrument, 'id' | 'created_at'>>
    ) => {
      await handleUpdateItem(itemId, formData);
      showSuccess('Item updated successfully.');
    },
    [handleUpdateItem, showSuccess]
  );

  // Handle item deletion
  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (hasFatalError) {
        throw new Error(
          'Dashboard failed to load — retry before making changes'
        );
      }
      await deleteInstrument(itemId);
      showSuccess('Item deleted successfully.');
    },
    [hasFatalError, deleteInstrument, showSuccess]
  );

  const reloadDashboard = useCallback(async () => {
    await Promise.all([
      fetchClients({ force: true }),
      fetchInstruments({ all: true }),
      fetchConnections({ all: true, force: true }),
    ]);
  }, [fetchClients, fetchInstruments, fetchConnections]);

  return {
    // Data
    instruments,
    allInstrumentResultsTruncated,
    allInstrumentResultsTotalCount,
    allInstrumentResultsLoadedCount,
    clients,
    clientRelationships,

    // Loading states
    loading,
    errors: safeErrors,
    submitting,

    // Derived error severity
    hasFatalError,

    // CRUD operations
    handleCreateItem,
    handleUpdateItem,
    handleUpdateItemInline,
    handleDeleteItem,
    reloadDashboard,
  };
};
