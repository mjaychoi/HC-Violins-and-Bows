import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientInstrument } from '@/types';
import { useModalState } from '@/hooks/useModalState';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

export function useConnectionForm() {
  const {
    isOpen: showConnectionModal,
    openModal,
    resetModal,
  } = useModalState();
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [relationshipType, setRelationshipType] =
    useState<ClientInstrument['relationship_type']>('Interested');
  const [connectionNotes, setConnectionNotes] = useState('');

  // Search states
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const [connectionSearchTerm, setConnectionSearchTerm] = useState('');
  const { tenantIdentityKey } = useTenantIdentity();
  const lastTenantIdentityKeyRef = useRef<string | null>(null);

  const resetForm = useCallback(() => {
    setSelectedClient('');
    setSelectedInstrument('');
    setRelationshipType('Interested');
    setConnectionNotes('');
    resetModal();
  }, [resetModal]);

  const open = () => openModal();
  const close = () => {
    resetForm();
  };

  useEffect(() => {
    if (lastTenantIdentityKeyRef.current === tenantIdentityKey) {
      return;
    }
    lastTenantIdentityKeyRef.current = tenantIdentityKey;
    resetForm();
  }, [tenantIdentityKey, resetForm]);

  return {
    // Form states
    showConnectionModal,
    selectedClient,
    selectedInstrument,
    relationshipType,
    connectionNotes,

    // Search states
    clientSearchTerm,
    instrumentSearchTerm,
    connectionSearchTerm,

    // Form actions
    setSelectedClient,
    setSelectedInstrument,
    setRelationshipType,
    setConnectionNotes,
    setClientSearchTerm,
    setInstrumentSearchTerm,
    setConnectionSearchTerm,

    // Modal actions
    openModal: open,
    closeModal: close,
    resetForm,
  };
}
