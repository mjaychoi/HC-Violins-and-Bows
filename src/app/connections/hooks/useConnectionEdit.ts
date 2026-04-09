import { useEffect, useState } from 'react';
import { ClientInstrument } from '@/types';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

export const useConnectionEdit = () => {
  const [editingConnection, setEditingConnection] =
    useState<ClientInstrument | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const { tenantIdentityKey } = useTenantIdentity();

  const openEditModal = (connection: ClientInstrument) => {
    setEditingConnection(connection);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setEditingConnection(null);
    setShowEditModal(false);
  };

  useEffect(() => {
    closeEditModal();
  }, [tenantIdentityKey]);

  return {
    editingConnection,
    showEditModal,
    openEditModal,
    closeEditModal,
  };
};
