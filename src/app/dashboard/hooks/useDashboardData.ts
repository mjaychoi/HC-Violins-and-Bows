'use client';

import { useCallback, useMemo } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { normalizeUnifiedResourceErrors } from '@/hooks/unifiedResourceErrors';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useToast } from '@/contexts/ToastContext';
import { format } from 'date-fns';

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
        const result = await createInstrument(formData);
        if (!result?.id) {
          throw new Error('Instrument creation failed');
        }
        return result;
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

      // 이전 상태 확인 (O(1) lookup)
      const previousInstrument = instrumentMap.get(itemId) as
        | Instrument
        | undefined;

      // FIXED: Clearer status change logic
      const nextStatus = formData.status; // possibly undefined
      const statusIsChanging = nextStatus !== undefined;

      const wasSold = previousInstrument?.status === 'Sold';
      const isNowSold = nextStatus === 'Sold';
      let updatePayload: Partial<Omit<Instrument, 'id' | 'created_at'>> & {
        sale_transition?: DashboardSaleTransition;
      } = { ...formData };

      if (!statusIsChanging) {
        return await updateInstrument(itemId, updatePayload);
      }

      if (isNowSold && !wasSold && previousInstrument) {
        const salePrice =
          formData.price !== undefined && formData.price !== null
            ? Number(formData.price)
            : previousInstrument.price !== undefined &&
                previousInstrument.price !== null
              ? Number(previousInstrument.price)
              : null;

        if (
          typeof salePrice !== 'number' ||
          !Number.isFinite(salePrice) ||
          salePrice <= 0
        ) {
          throw new Error(
            'Sale price is required when marking an instrument as Sold.'
          );
        }

        const saleDate = format(new Date(), 'yyyy-MM-dd');
        const soldConnection = soldConnectionsMap.get(itemId);

        updatePayload = {
          ...formData,
          sale_transition: {
            sale_price: salePrice,
            sale_date: saleDate,
            client_id: soldConnection?.client_id || null,
            sales_note: 'Auto-created when instrument status changed to Sold',
          },
        };
      } else if (wasSold && !isNowSold && previousInstrument) {
        updatePayload = {
          ...formData,
          sale_transition: {
            sales_note: `Auto-refunded when instrument status changed from Sold to ${
              formData.status || 'Available'
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
      showSuccess('아이템이 성공적으로 수정되었습니다.');
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
      showSuccess('아이템이 성공적으로 삭제되었습니다.');
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
