import { useState, useMemo, useCallback, useEffect } from 'react';
import { Client } from '@/types';
import { shouldShowInterestDropdown } from '@/policies/interest';
import { ClientViewFormData } from '../types';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

const EMPTY_FORM_DATA: ClientViewFormData = {
  last_name: '',
  first_name: '',
  contact_number: '',
  email: '',
  tags: [],
  interest: '',
  note: '',
};

export function useClientView() {
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [viewFormData, setViewFormData] =
    useState<ClientViewFormData>(EMPTY_FORM_DATA);
  const { tenantIdentityKey } = useTenantIdentity();

  // ✅ FIXED: showInterestDropdown를 파생값(useMemo)으로 변경
  const showInterestDropdown = useMemo(() => {
    return shouldShowInterestDropdown(viewFormData.tags);
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

  // ✅ FIXED: closeClientView에서 폼 리셋 추가 (이전 값 잔상 방지)
  const closeClientView = useCallback(() => {
    setShowViewModal(false);
    setSelectedClient(null);
    setIsEditing(false);
    setViewFormData(EMPTY_FORM_DATA);
  }, []);

  const startEditing = () => setIsEditing(true);
  const stopEditing = () => setIsEditing(false);

  const updateViewFormData = useCallback(
    (updates: Partial<ClientViewFormData>) => {
      setViewFormData(prev => ({ ...prev, ...updates }));
    },
    []
  );

  // ✅ FIXED: 타입 안전하고 재사용 가능한 setter 제공
  const setField = useCallback(
    <K extends keyof ClientViewFormData>(
      key: K,
      value: ClientViewFormData[K]
    ) => {
      setViewFormData(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleTag = useCallback((tag: string, checked: boolean) => {
    setViewFormData(prev => {
      const cur = prev.tags ?? [];
      const next = checked
        ? Array.from(new Set([...cur, tag]))
        : cur.filter(t => t !== tag);
      return { ...prev, tags: next };
    });
  }, []);

  useEffect(() => {
    setShowViewModal(false);
    setSelectedClient(null);
    setIsEditing(false);
    setViewFormData(EMPTY_FORM_DATA);
  }, [tenantIdentityKey]);

  // ✅ FIXED: handleViewInputChange를 명시적 setter 사용하도록 개선
  const handleViewInputChange = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      const { name, value, type } = e.target;
      if (type === 'checkbox' && name === 'tags') {
        const checkbox = e.target as HTMLInputElement;
        toggleTag(value, checkbox.checked);
        return;
      }
      if (type === 'checkbox') {
        return;
      }
      setField(name as keyof ClientViewFormData, value);
    },
    [setField, toggleTag]
  );

  const applyServerClient = useCallback((client: Client) => {
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
  }, []);

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
    applyServerClient,
    setField,
    toggleTag,
  };
}
