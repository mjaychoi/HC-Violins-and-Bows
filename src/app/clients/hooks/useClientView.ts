import { useState, useEffect } from 'react';
import { Client } from '@/types';

export function useClientView() {
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showInterestDropdown, setShowInterestDropdown] = useState(false);

  const [viewFormData, setViewFormData] = useState({
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    tags: [] as string[],
    interest: '',
    note: '',
  });

  // Interest 드롭다운 표시 여부: 태그에 따라 항상 반영
  useEffect(() => {
    const shouldShowInterest = viewFormData.tags.some(tag =>
      ['Musician', 'Dealer', 'Collector'].includes(tag)
    );
    setShowInterestDropdown(shouldShowInterest);
  }, [viewFormData.tags]);

  const openClientView = (client: Client, editMode: boolean = true) => {
    setSelectedClient(client);
    setViewFormData({
      last_name: client.last_name || '',
      first_name: client.first_name || '',
      contact_number: client.contact_number || '',
      email: client.email || '',
      tags: client.tags || [],
      interest: client.interest || '',
      note: client.note || '',
    });
    setIsEditing(editMode);
    setShowViewModal(true);
  };

  const closeClientView = () => {
    setShowViewModal(false);
    setSelectedClient(null);
    setIsEditing(false);
  };

  const startEditing = () => setIsEditing(true);
  const stopEditing = () => setIsEditing(false);

  const updateViewFormData = (updates: Partial<typeof viewFormData>) => {
    setViewFormData(prev => ({ ...prev, ...updates }));
  };

  const handleViewInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox' && name === 'tags') {
      const checkbox = e.target as HTMLInputElement;
      const tag = value;
      setViewFormData(prev => {
        const current = Array.isArray(prev.tags) ? prev.tags : [];
        const nextTags = checkbox.checked
          ? Array.from(new Set([...current, tag]))
          : current.filter(t => t !== tag);
        return { ...prev, tags: nextTags };
      });
      return;
    }
    setViewFormData(prev => ({
      ...prev,
      [name]:
        type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  return {
    showViewModal,
    selectedClient,
    isEditing,
    showInterestDropdown,
    viewFormData,
    openClientView,
    closeClientView,
    startEditing,
    stopEditing,
    updateViewFormData,
    handleViewInputChange,
  };
}
