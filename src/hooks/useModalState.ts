// src/hooks/useModalState.ts
import { useState, useCallback } from 'react'

// Generic modal state management hook
export function useModalState() {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const openModal = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    setIsEditing(false)
  }, [])

  const openEditModal = useCallback(() => {
    setIsOpen(true)
    setIsEditing(true)
  }, [])

  const openViewModal = useCallback(() => {
    setIsOpen(true)
    setIsEditing(false)
  }, [])

  return {
    isOpen,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
    openViewModal,
    setIsOpen,
    setIsEditing
  }
}
