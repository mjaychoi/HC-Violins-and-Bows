import { useCallback, useState } from 'react';
import { useModalState } from '@/hooks/useModalState';
import { Instrument } from '@/types';

export interface UseDashboardModalOptions {
  /**
   * 실제 삭제를 수행하는 함수
   * confirmItemId가 설정된 상태에서 handleConfirmDelete가 호출되면 이 함수가 실행됨
   */
  onDelete: (id: string) => Promise<void>;
}

export const useDashboardModal = (options?: UseDashboardModalOptions) => {
  const {
    isOpen: isModalOpen,
    isEditing,
    openModal: openAddModal,
    closeModal,
    openEditModal,
    selectedItem,
  } = useModalState<Instrument>();

  // ✅ FIXED: confirmItem 객체 대신 ID만 저장하여 stale object 방지
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);

  // Handle add new item
  const handleAddItem = useCallback(() => {
    openAddModal();
  }, [openAddModal]);

  // Handle request delete (shows confirm dialog)
  const handleRequestDelete = useCallback((itemId: string) => {
    setConfirmItemId(itemId);
  }, []);

  // Handle cancel delete
  const handleCancelDelete = useCallback(() => {
    setConfirmItemId(null);
  }, []);

  // ✅ FIXED: 실제 삭제를 수행하는 핸들러 추가
  const handleConfirmDelete = useCallback(async () => {
    if (!confirmItemId || !options?.onDelete) return;
    try {
      await options.onDelete(confirmItemId);
      setConfirmItemId(null);
    } catch {
      // 에러는 onDelete에서 처리됨
      // 실패 시 confirm 다이얼로그는 유지 (사용자가 재시도 가능)
    }
  }, [confirmItemId, options]);

  // Check if confirm dialog should be open
  const isConfirmDialogOpen = Boolean(confirmItemId);

  return {
    // Modal state
    isModalOpen,
    isEditing,
    selectedItem,
    closeModal,
    openEditModal,
    handleAddItem,

    // Delete confirmation
    confirmItemId,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
    handleConfirmDelete,
  };
};
