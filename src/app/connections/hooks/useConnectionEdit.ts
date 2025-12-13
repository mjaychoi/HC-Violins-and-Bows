import { useState } from 'react';
import { ClientInstrument } from '@/types';

export const useConnectionEdit = () => {
  const [editingConnection, setEditingConnection] =
    useState<ClientInstrument | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const openEditModal = (connection: ClientInstrument) => {
    setEditingConnection(connection);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setEditingConnection(null);
    setShowEditModal(false);
  };

  return {
    editingConnection,
    showEditModal,
    openEditModal,
    closeEditModal,
  };
};
