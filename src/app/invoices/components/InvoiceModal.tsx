'use client';

import React from 'react';
import Modal from '@/components/common/modals/Modal';
import InvoiceForm from './InvoiceForm';
import type { Invoice, InvoiceStatus } from '@/types';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
  isEditing?: boolean;
  closeOnSuccess?: boolean;
  invoiceSettings?: {
    business_name?: string;
    address?: string;
    phone?: string;
    email?: string;
    bank_account_holder?: string;
    bank_name?: string;
    bank_swift_code?: string;
    bank_account_number?: string;
    default_conditions?: string;
    default_exchange_rate?: string;
    default_currency?: string;
  } | null;
  onSubmit: (data: {
    client_id: string | null;
    invoice_date: string;
    due_date: string | null;
    subtotal: number;
    tax: number | null;
    total: number;
    currency: string;
    status: InvoiceStatus;
    notes: string | null;
    items: Array<{
      instrument_id: string | null;
      description: string;
      qty: number;
      rate: number;
      amount: number;
      image_url: string | null;
      display_order: number;
    }>;
  }) => Promise<void>;
  submitting?: boolean;
}

export default function InvoiceModal({
  isOpen,
  onClose,
  invoice,
  isEditing = false,
  closeOnSuccess = false,
  invoiceSettings,
  onSubmit,
  submitting = false,
}: InvoiceModalProps) {
  const handleSubmit = async (data: Parameters<typeof onSubmit>[0]) => {
    await onSubmit(data);
    if (closeOnSuccess) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Invoice' : 'Create Invoice'}
      size="xl"
    >
      <InvoiceForm
        invoice={invoice}
        isEditing={isEditing}
        invoiceSettings={invoiceSettings}
        onSubmit={handleSubmit}
        onClose={onClose}
        submitting={submitting}
      />
    </Modal>
  );
}
