import { useCallback, useState } from 'react';
import { Instrument } from '@/types';
import { useModalState } from '@/hooks/useModalState';

export const useDashboardModal = () => {
  const {
    isOpen: showModal,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
    selectedItem,
  } = useModalState<Instrument>();

  const [confirmItem, setConfirmItem] = useState<Instrument | null>(null);

  // Handle add new item
  const handleAddItem = useCallback(() => {
    openModal();
  }, [openModal]);

  // Handle request delete (shows confirm dialog)
  const handleRequestDelete = useCallback((item: Instrument) => {
    setConfirmItem(item);
  }, []);

  // Handle cancel delete
  const handleCancelDelete = useCallback(() => {
    setConfirmItem(null);
  }, []);

  // Check if confirm dialog should be open
  const isConfirmDialogOpen = Boolean(confirmItem);

  return {
    // Modal state
    showModal,
    isEditing,
    selectedItem,
    closeModal,
    openEditModal,
    handleAddItem,

    // Delete confirmation
    confirmItem,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
  };
};
