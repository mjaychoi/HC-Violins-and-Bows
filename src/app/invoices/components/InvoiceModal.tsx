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
  settingsStatus?: 'idle' | 'loading' | 'success' | 'error';
  settingsErrorMessage?: string | null;
  onRetrySettingsLoad?: () => void;
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
  settingsStatus = 'success',
  settingsErrorMessage = null,
  onRetrySettingsLoad,
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
      {!isEditing && settingsStatus === 'loading' ? (
        <div className="py-10 text-center text-sm text-gray-600">
          Loading invoice defaults...
        </div>
      ) : !isEditing && settingsStatus === 'error' ? (
        <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6">
          <div>
            <h3 className="text-sm font-semibold text-red-800">
              Failed to load invoice defaults
            </h3>
            <p className="mt-1 text-sm text-red-700">
              {settingsErrorMessage ||
                'Invoice settings could not be loaded. Retry before creating the invoice.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onRetrySettingsLoad}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <InvoiceForm
          invoice={invoice}
          isEditing={isEditing}
          invoiceSettings={invoiceSettings}
          onSubmit={handleSubmit}
          onClose={onClose}
          submitting={submitting}
        />
      )}
    </Modal>
  );
}
