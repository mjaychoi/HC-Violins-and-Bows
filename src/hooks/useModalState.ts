import { useState, useCallback } from 'react';

interface UseModalStateOptions {
  initialOpen?: boolean;
  initialEditing?: boolean;
}

interface UseModalStateReturn<T = unknown> {
  isOpen: boolean;
  isEditing: boolean;
  selectedItem: T | null;
  setIsOpen: (open: boolean) => void;
  setIsEditing: (editing: boolean) => void;
  setSelectedItem: (item: T | null) => void;
  openModal: () => void;
  closeModal: () => void;
  openEditModal: (item: T) => void;
  openViewModal: (item: T) => void;
  toggleModal: () => void;
  resetModal: () => void;
}

export function useModalState<T = unknown>(
  options: UseModalStateOptions = {}
): UseModalStateReturn<T> {
  const { initialOpen = false, initialEditing = false } = options;

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const openModal = useCallback(() => {
    setIsOpen(true);
    setIsEditing(false);
    setSelectedItem(null);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setIsEditing(false);
    setSelectedItem(null);
  }, []);

  const openEditModal = useCallback((item: T) => {
    setSelectedItem(item);
    setIsEditing(true);
    setIsOpen(true);
  }, []);

  const openViewModal = useCallback((item: T) => {
    setSelectedItem(item);
    setIsEditing(false);
    setIsOpen(true);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const resetModal = useCallback(() => {
    setIsOpen(false);
    setIsEditing(false);
    setSelectedItem(null);
  }, []);

  return {
    isOpen,
    isEditing,
    selectedItem,
    setIsOpen,
    setIsEditing,
    setSelectedItem,
    openModal,
    closeModal,
    openEditModal,
    openViewModal,
    toggleModal,
    resetModal,
  };
}
