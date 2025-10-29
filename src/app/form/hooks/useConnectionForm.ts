import { useState } from 'react';
import { ClientInstrument } from '@/types';

export function useConnectionForm() {
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [relationshipType, setRelationshipType] =
    useState<ClientInstrument['relationship_type']>('Interested');
  const [connectionNotes, setConnectionNotes] = useState('');

  // Search states
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const [connectionSearchTerm, setConnectionSearchTerm] = useState('');

  const resetForm = () => {
    setSelectedClient('');
    setSelectedInstrument('');
    setRelationshipType('Interested');
    setConnectionNotes('');
    setShowConnectionModal(false);
  };

  const openModal = () => {
    setShowConnectionModal(true);
  };

  const closeModal = () => {
    resetForm();
  };

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
    openModal,
    closeModal,
    resetForm,
  };
}
