import { useCallback, useMemo } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useToast } from '@/hooks/useToast';
import { format } from 'date-fns';

export const useDashboardData = () => {
  const { handleError } = useErrorHandler();
  const { showSuccess } = useToast();
  const { withSubmitting } = useLoadingState();

  const {
    instruments,
    clients,
    loading,
    submitting,
    clientRelationships,
    createInstrument,
    updateInstrument,
    deleteInstrument,
  } = useUnifiedDashboard();

  // Optimized: Create Maps for O(1) lookups instead of O(n) find operations
  const instrumentMap = useMemo(
    () => new Map(instruments.map((instrument: Instrument) => [instrument.id, instrument])),
    [instruments]
  );
  
  // FIXED: Use explicit ClientInstrument type instead of typeof clientRelationships[0]
  const soldConnectionsMap = useMemo(
    () => {
      const map = new Map<string, ClientInstrument>();
      clientRelationships.forEach((conn: ClientInstrument & { client?: unknown; instrument?: unknown }) => {
        if (conn.relationship_type === 'Sold' && conn.instrument_id) {
          map.set(conn.instrument_id, conn);
        }
      });
      return map;
    },
    [clientRelationships]
  );

  // Handle item creation
  const handleCreateItem = useCallback(
    async (formData: Omit<Instrument, 'id' | 'created_at'>) => {
      try {
        await withSubmitting(async () => {
          await createInstrument(formData);
          showSuccess('아이템이 성공적으로 생성되었습니다.');
        });
      } catch (error) {
        handleError(error, 'Failed to create item');
        throw error; // Re-throw to allow form to handle error
      }
    },
    [createInstrument, withSubmitting, showSuccess, handleError]
  );

  // Handle item update
  const handleUpdateItem = useCallback(
    async (
      itemId: string,
      formData: Partial<Omit<Instrument, 'id' | 'created_at'>>
    ) => {
      try {
        // 이전 상태 확인 (O(1) lookup)
        const previousInstrument = instrumentMap.get(itemId) as Instrument | undefined;
        const wasSold = previousInstrument?.status === 'Sold';
        const isNowSold = formData.status === 'Sold';

        // FIXED: Early return side effects when status is not changing
        const statusIsChanging = typeof formData.status !== 'undefined';
        
        // 악기 업데이트
        const result = await updateInstrument(itemId, formData);
        if (!result) {
          throw new Error('Failed to update item');
        }

        // 성공 메시지 표시
        showSuccess('아이템이 성공적으로 수정되었습니다.');

        // FIXED: Skip side effects if status is not changing
        if (!statusIsChanging) {
          return result;
        }

        // 상태가 'Sold'로 변경되었고, 이전에는 'Sold'가 아니었을 때 sales_history 생성
        if (isNowSold && !wasSold && previousInstrument) {
          try {
            // 판매 가격: formData.price 또는 previousInstrument.price 사용
            const salePrice = formData.price 
              ? parseFloat(formData.price.toString()) 
              : previousInstrument.price 
              ? parseFloat(previousInstrument.price.toString())
              : null;

            // 판매 날짜: 오늘 날짜
            const saleDate = format(new Date(), 'yyyy-MM-dd');

            // 고객 ID: soldConnectionsMap에서 O(1) lookup
            const soldConnection = soldConnectionsMap.get(itemId);
            const clientId = soldConnection?.client_id || null;

            // 판매 가격이 있으면 sales_history 생성
            if (salePrice && salePrice > 0) {
              const response = await fetch('/api/sales', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  sale_price: salePrice,
                  sale_date: saleDate,
                  instrument_id: itemId,
                  client_id: clientId,
                  notes: `Auto-created when instrument status changed to Sold`,
                }),
              });

              if (!response.ok) {
                const errorData = await response.json();
                console.warn('Failed to create sales history:', errorData);
                // 에러가 발생해도 악기 업데이트는 성공했으므로 계속 진행
              }
            }
          } catch (salesError) {
            // sales_history 생성 실패는 경고만 하고 계속 진행
            console.warn('Failed to create sales history:', salesError);
          }
        }

        // 상태가 'Sold'에서 다른 상태로 변경되었을 때 자동 환불 처리
        if (wasSold && !isNowSold && previousInstrument) {
          try {
            // 해당 악기의 최근 판매 기록 찾기 (환불되지 않은 것만, 날짜 내림차순 정렬)
            const response = await fetch(
              `/api/sales?instrument_id=${itemId}&page=1&pageSize=10&sortColumn=sale_date&sortDirection=desc`
            );
            if (response.ok) {
              const result = await response.json();
              // 환불되지 않은 최근 판매 기록 찾기
              const recentSale = result.data?.find(
                (sale: { sale_price: number; instrument_id: string | null }) =>
                  sale.instrument_id === itemId && sale.sale_price > 0
              );

              if (recentSale) {
                // 환불 처리
                const refundResponse = await fetch('/api/sales', {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    id: recentSale.id,
                    sale_price: -Math.abs(recentSale.sale_price),
                    notes: `Auto-refunded when instrument status changed from Sold to ${formData.status || 'Available'} on ${format(new Date(), 'yyyy-MM-dd')}${recentSale.notes ? ` | ${recentSale.notes}` : ''}`,
                  }),
                });

                if (!refundResponse.ok) {
                  const errorData = await refundResponse.json();
                  console.warn('Failed to auto-refund sales history:', errorData);
                } else {
                  showSuccess('판매 기록이 자동으로 환불 처리되었습니다.');
                }
              }
            }
          } catch (refundError) {
            // 환불 실패는 경고만 하고 계속 진행
            console.warn('Failed to auto-refund sales history:', refundError);
          }
        }

        // FIXED: Remove duplicate showSuccess - already called after updateInstrument
        return result;
      } catch (error) {
        handleError(error, 'Failed to update item');
        throw error; // Re-throw to allow form to handle error
      }
    },
    [updateInstrument, showSuccess, handleError, instrumentMap, soldConnectionsMap]
  );

  // Handle item update for inline editing (returns void)
  const handleUpdateItemInline = useCallback(
    async (
      itemId: string,
      formData: Partial<Omit<Instrument, 'id' | 'created_at'>>
    ) => {
      await handleUpdateItem(itemId, formData);
    },
    [handleUpdateItem]
  );

  // Handle item deletion
  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      try {
        await deleteInstrument(itemId);
        showSuccess('아이템이 성공적으로 삭제되었습니다.');
      } catch (error) {
        handleError(error, 'Failed to delete item');
        throw error;
      }
    },
    [deleteInstrument, showSuccess, handleError]
  );

  return {
    // Data
    instruments,
    clients,
    clientRelationships,
    
    // Loading states
    loading,
    submitting,
    
    // CRUD operations
    handleCreateItem,
    handleUpdateItem,
    handleUpdateItemInline,
    handleDeleteItem,
  };
};
