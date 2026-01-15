'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Invoice, InvoiceStatus } from '@/types';
import { useFormState } from '@/hooks/useFormState';
import { Button, Input } from '@/components/common/inputs';
import {
  useUnifiedClients,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { apiFetch } from '@/utils/apiFetch';
import OptimizedImage from '@/components/common/OptimizedImage';
import { logError } from '@/utils/logger';

interface InvoiceFormItem {
  id: string; // 임시 ID (로컬 상태 관리용)
  instrument_id: string | null;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  image_url: string | null;
  imageFile?: File | null; // 업로드할 이미지 파일
  display_order: number;
}

interface InvoiceFormProps {
  invoice?: Invoice | null;
  isEditing?: boolean;
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
    business_name?: string | null;
    business_address?: string | null;
    business_phone?: string | null;
    business_email?: string | null;
    bank_account_holder?: string | null;
    bank_name?: string | null;
    bank_swift_code?: string | null;
    bank_account_number?: string | null;
    default_conditions?: string | null;
    default_exchange_rate?: string | null;
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
  onClose: () => void;
  submitting?: boolean;
}

function InvoiceForm({
  invoice,
  isEditing = false,
  invoiceSettings,
  onSubmit,
  onClose,
  submitting = false,
}: InvoiceFormProps) {
  const { clients } = useUnifiedClients();
  const { instruments } = useUnifiedInstruments();

  const initialFormData = {
    client_id: invoice?.client_id || null,
    invoice_date:
      invoice?.invoice_date || new Date().toISOString().split('T')[0],
    due_date: invoice?.due_date || null,
    subtotal: invoice?.subtotal || 0,
    tax: invoice?.tax || null,
    total: invoice?.total || 0,
    currency: invoice?.currency || invoiceSettings?.default_currency || 'USD',
    status: (invoice?.status || 'draft') as InvoiceStatus,
    notes: invoice?.notes || null,
    // Business info fields - use invoice values or default to invoice settingㅛ
    business_name:
      invoice?.business_name ?? invoiceSettings?.business_name ?? null,
    business_address:
      invoice?.business_address ?? invoiceSettings?.address ?? null,
    business_phone: invoice?.business_phone ?? invoiceSettings?.phone ?? null,
    business_email: invoice?.business_email ?? invoiceSettings?.email ?? null,
    // Banking info fields
    bank_account_holder:
      invoice?.bank_account_holder ??
      invoiceSettings?.bank_account_holder ??
      null,
    bank_name: invoice?.bank_name ?? invoiceSettings?.bank_name ?? null,
    bank_swift_code:
      invoice?.bank_swift_code ?? invoiceSettings?.bank_swift_code ?? null,
    bank_account_number:
      invoice?.bank_account_number ??
      invoiceSettings?.bank_account_number ??
      null,
    // Additional fields
    default_conditions:
      invoice?.default_conditions ??
      invoiceSettings?.default_conditions ??
      null,
    default_exchange_rate:
      invoice?.default_exchange_rate ??
      invoiceSettings?.default_exchange_rate ??
      null,
  };

  const { formData, updateField } = useFormState(initialFormData);

  // Invoice items state
  const [items, setItems] = useState<InvoiceFormItem[]>(() => {
    if (invoice?.items && invoice.items.length > 0) {
      return invoice.items.map((item, index) => ({
        id: item.id,
        instrument_id: item.instrument_id,
        description: item.description,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        image_url: item.image_url,
        display_order: item.display_order ?? index,
      }));
    }
    return [];
  });
  const [uploadingItemIds, setUploadingItemIds] = useState<Set<string>>(
    () => new Set()
  );
  const itemsRef = useRef<InvoiceFormItem[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when invoice changes
  useEffect(() => {
    if (invoice && isEditing) {
      updateField('client_id', invoice.client_id);
      updateField('invoice_date', invoice.invoice_date);
      updateField('due_date', invoice.due_date);
      updateField('subtotal', invoice.subtotal);
      updateField('tax', invoice.tax);
      updateField('total', invoice.total);
      updateField('currency', invoice.currency);
      updateField('status', invoice.status);
      updateField('notes', invoice.notes || null);
      // Business info fields
      updateField('business_name', invoice.business_name ?? null);
      updateField('business_address', invoice.business_address ?? null);
      updateField('business_phone', invoice.business_phone ?? null);
      updateField('business_email', invoice.business_email ?? null);
      // Banking info fields
      updateField('bank_account_holder', invoice.bank_account_holder ?? null);
      updateField('bank_name', invoice.bank_name ?? null);
      updateField('bank_swift_code', invoice.bank_swift_code ?? null);
      updateField('bank_account_number', invoice.bank_account_number ?? null);
      // Additional fields
      updateField('default_conditions', invoice.default_conditions ?? null);
      updateField(
        'default_exchange_rate',
        invoice.default_exchange_rate ?? null
      );

      if (invoice.items) {
        setItems(
          invoice.items.map((item, index) => ({
            id: item.id,
            instrument_id: item.instrument_id,
            description: item.description,
            qty: item.qty,
            rate: item.rate,
            amount: item.amount,
            image_url: item.image_url,
            display_order: item.display_order ?? index,
          }))
        );
      }
    } else if (!invoice && !isEditing && invoiceSettings) {
      // Prefill from invoice settings when creating new invoice
      if (invoiceSettings.default_currency) {
        updateField('currency', invoiceSettings.default_currency);
      }
      if (invoiceSettings.business_name) {
        updateField('business_name', invoiceSettings.business_name);
      }
      if (invoiceSettings.address) {
        updateField('business_address', invoiceSettings.address);
      }
      if (invoiceSettings.phone) {
        updateField('business_phone', invoiceSettings.phone);
      }
      if (invoiceSettings.email) {
        updateField('business_email', invoiceSettings.email);
      }
      if (invoiceSettings.bank_account_holder) {
        updateField('bank_account_holder', invoiceSettings.bank_account_holder);
      }
      if (invoiceSettings.bank_name) {
        updateField('bank_name', invoiceSettings.bank_name);
      }
      if (invoiceSettings.bank_swift_code) {
        updateField('bank_swift_code', invoiceSettings.bank_swift_code);
      }
      if (invoiceSettings.bank_account_number) {
        updateField('bank_account_number', invoiceSettings.bank_account_number);
      }
      if (invoiceSettings.default_conditions) {
        updateField('default_conditions', invoiceSettings.default_conditions);
      }
      if (invoiceSettings.default_exchange_rate) {
        updateField(
          'default_exchange_rate',
          invoiceSettings.default_exchange_rate
        );
      }
    }
  }, [invoice, isEditing, invoiceSettings, updateField]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach(item => {
        if (item.image_url?.startsWith('blob:')) {
          URL.revokeObjectURL(item.image_url);
        }
      });
    };
  }, []);

  // Calculate totals when items change
  useEffect(() => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = formData.tax || 0;
    const total = subtotal + taxAmount;

    updateField('subtotal', subtotal);
    updateField('total', total);
  }, [items, formData.tax, updateField]);

  const createTempItemId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `temp-${crypto.randomUUID()}`;
    }
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  // Add new item
  const addItem = useCallback(() => {
    const newItem: InvoiceFormItem = {
      id: createTempItemId(),
      instrument_id: null,
      description: '',
      qty: 1,
      rate: 0,
      amount: 0,
      image_url: null,
      display_order: items.length,
    };
    setItems(prev => [...prev, newItem]);
  }, [items.length]);

  // Remove item
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  // Update item field
  const updateItem = useCallback(
    (
      id: string,
      field: keyof InvoiceFormItem,
      value: InvoiceFormItem[keyof InvoiceFormItem]
    ) => {
      setItems(prev =>
        prev.map(item => {
          if (item.id === id) {
            const updated = { ...item, [field]: value };
            // Auto-calculate amount when qty or rate changes
            if (field === 'qty' || field === 'rate') {
              updated.amount = updated.qty * updated.rate;
            }
            return updated;
          }
          return item;
        })
      );
    },
    []
  );

  // Handle instrument selection for item
  const handleItemInstrumentSelect = useCallback(
    (itemId: string, instrumentId: string | null) => {
      if (!instrumentId) {
        updateItem(itemId, 'instrument_id', null);
        updateItem(itemId, 'description', '');
        return;
      }

      const instrument = instruments.find(inst => inst.id === instrumentId);
      if (instrument) {
        const descriptionParts: string[] = [];
        if (instrument.type) descriptionParts.push(instrument.type);
        if (instrument.maker) descriptionParts.push(instrument.maker);
        if (instrument.year) descriptionParts.push(String(instrument.year));
        if (instrument.has_certificate)
          descriptionParts.push('with certificate');
        const description = descriptionParts.join(', ') || 'Instrument';

        updateItem(itemId, 'instrument_id', instrumentId);
        updateItem(itemId, 'description', description);
        updateItem(itemId, 'rate', instrument.price || 0);
        const currentItem = items.find(i => i.id === itemId);
        updateItem(
          itemId,
          'amount',
          (instrument.price || 0) * (currentItem?.qty || 1)
        );
      }
    },
    [instruments, items, updateItem]
  );

  // Handle image upload for item
  const handleItemImageUpload = useCallback(
    async (itemId: string, file: File) => {
      if (uploadingItemIds.has(itemId)) return;
      setUploadingItemIds(prev => new Set(prev).add(itemId));
      let previewUrl: string | null = null;
      try {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          setErrors(prev => ({
            ...prev,
            [`item-${itemId}-image`]: '이미지 파일만 업로드 가능합니다',
          }));
          return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          setErrors(prev => ({
            ...prev,
            [`item-${itemId}-image`]: '이미지 크기는 10MB 이하여야 합니다',
          }));
          return;
        }

        // Create temporary preview URL for immediate display
        previewUrl = URL.createObjectURL(file);
        updateItem(itemId, 'image_url', previewUrl);
        updateItem(itemId, 'imageFile', file);

        // Upload to Supabase Storage
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiFetch('/api/invoices/images', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload image');
        }

        const result = await response.json();

        // Replace preview URL with actual public URL
        updateItem(itemId, 'image_url', result.publicUrl);

        // Clean up preview URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }

        // Clear any previous errors
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[`item-${itemId}-image`];
          return newErrors;
        });
      } catch (error) {
        logError(
          'Failed to upload image:',
          error instanceof Error ? error.message : String(error)
        );
        setErrors(prev => ({
          ...prev,
          [`item-${itemId}-image`]:
            error instanceof Error ? error.message : '이미지 업로드 실패',
        }));
        // Clean up on error
        updateItem(itemId, 'image_url', null);
        updateItem(itemId, 'imageFile', null);
      } finally {
        setUploadingItemIds(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    },
    [updateItem, uploadingItemIds]
  );

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate form
    if (!formData.client_id) {
      setErrors(prev => ({
        ...prev,
        client_id: 'Client is required',
      }));
      return;
    }

    if (!formData.invoice_date) {
      setErrors(prev => ({
        ...prev,
        invoice_date: 'Invoice date is required',
      }));
      return;
    }

    if (items.length === 0) {
      setErrors(prev => ({ ...prev, items: 'At least one item is required' }));
      return;
    }

    // Validate items
    const itemErrors: Record<string, string> = {};
    items.forEach(item => {
      if (!item.description.trim()) {
        itemErrors[`item-${item.id}-description`] = 'Description is required';
      }
      if (item.qty <= 0) {
        itemErrors[`item-${item.id}-qty`] = 'Quantity must be greater than 0';
      }
      if (item.rate < 0) {
        itemErrors[`item-${item.id}-rate`] = 'Rate must be non-negative';
      }
    });

    if (Object.keys(itemErrors).length > 0) {
      setErrors(itemErrors);
      return;
    }

    // Prepare items for submission (without temporary IDs and imageFile)
    const submitItems = items.map((item, index) => ({
      instrument_id: item.instrument_id,
      description: item.description,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      image_url: item.image_url,
      display_order: index,
    }));

    try {
      // Prepare data for submission, excluding undefined values for optional fields
      const submitData: {
        client_id: string | null;
        invoice_date: string;
        due_date: string | null;
        subtotal: number;
        tax: number | null;
        total: number;
        currency: string;
        status: InvoiceStatus;
        notes: string | null;
        business_name?: string | null;
        business_address?: string | null;
        business_phone?: string | null;
        business_email?: string | null;
        bank_account_holder?: string | null;
        bank_name?: string | null;
        bank_swift_code?: string | null;
        bank_account_number?: string | null;
        default_conditions?: string | null;
        default_exchange_rate?: string | null;
        items: typeof submitItems;
      } = {
        client_id: formData.client_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date ?? null,
        subtotal: formData.subtotal,
        tax: formData.tax ?? null,
        total: formData.total,
        currency: formData.currency,
        status: formData.status,
        notes: formData.notes ?? null,
        business_name: formData.business_name ?? null,
        business_address: formData.business_address ?? null,
        business_phone: formData.business_phone ?? null,
        business_email: formData.business_email ?? null,
        bank_account_holder: formData.bank_account_holder ?? null,
        bank_name: formData.bank_name ?? null,
        bank_swift_code: formData.bank_swift_code ?? null,
        bank_account_number: formData.bank_account_number ?? null,
        default_conditions: formData.default_conditions ?? null,
        default_exchange_rate: formData.default_exchange_rate ?? null,
        items: submitItems,
      };

      await onSubmit(submitData);
    } catch (error) {
      logError(
        'Failed to submit invoice:',
        error instanceof Error ? error.message : String(error)
      );
      setErrors(prev => ({ ...prev, submit: 'Failed to save invoice' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client Selection */}
      <div>
        <label
          htmlFor="client_id"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Client *
        </label>
        <select
          id="client_id"
          value={formData.client_id || ''}
          onChange={e => updateField('client_id', e.target.value || null)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.client_id
              ? 'border-red-300 focus:ring-red-500'
              : 'border-gray-300'
          }`}
        >
          <option value="">Select a client...</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>
              {client.first_name} {client.last_name}{' '}
              {client.email ? `(${client.email})` : ''}
            </option>
          ))}
        </select>
        {errors.client_id && (
          <p className="text-red-500 text-xs mt-1">{errors.client_id}</p>
        )}
      </div>

      {/* Invoice Date & Due Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="invoice_date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Invoice Date *
          </label>
          <Input
            id="invoice_date"
            type="date"
            value={formData.invoice_date}
            onChange={e => updateField('invoice_date', e.target.value)}
            error={errors.invoice_date}
          />
        </div>
        <div>
          <label
            htmlFor="due_date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Due Date
          </label>
          <Input
            id="due_date"
            type="date"
            value={formData.due_date || ''}
            onChange={e => updateField('due_date', e.target.value || null)}
          />
        </div>
      </div>

      {/* Status & Currency */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Status
          </label>
          <select
            id="status"
            value={formData.status}
            onChange={e =>
              updateField('status', e.target.value as typeof formData.status)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="currency"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Currency
          </label>
          <select
            id="currency"
            value={formData.currency}
            onChange={e => updateField('currency', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      {/* Items Section */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Items{' '}
            {errors.items && (
              <span className="text-red-500 text-xs">{errors.items}</span>
            )}
          </label>
          <Button type="button" onClick={addItem} variant="secondary" size="sm">
            + Add Item
          </Button>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="border border-gray-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Item {index + 1}</h4>
                <Button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  variant="secondary"
                  size="sm"
                >
                  Remove
                </Button>
              </div>

              {/* Instrument Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instrument (optional)
                </label>
                <select
                  value={item.instrument_id || ''}
                  onChange={e =>
                    handleItemInstrumentSelect(item.id, e.target.value || null)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an instrument...</option>
                  {instruments.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.serial_number || inst.id} - {inst.maker} {inst.type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <Input
                  value={item.description}
                  onChange={e =>
                    updateItem(item.id, 'description', e.target.value)
                  }
                  error={errors[`item-${item.id}-description`]}
                />
              </div>

              {/* Qty, Rate, Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Qty
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={e =>
                      updateItem(item.id, 'qty', parseInt(e.target.value) || 1)
                    }
                    error={errors[`item-${item.id}-qty`]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rate
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={e =>
                      updateItem(
                        item.id,
                        'rate',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    error={errors[`item-${item.id}-rate`]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={e =>
                      updateItem(
                        item.id,
                        'amount',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>

              {/* Item Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Image
                </label>
                {item.image_url ? (
                  <div className="relative inline-block">
                    <OptimizedImage
                      src={item.image_url}
                      alt="Item image"
                      width={200}
                      height={200}
                      className="rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        updateItem(item.id, 'image_url', null);
                        updateItem(item.id, 'imageFile', null);
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleItemImageUpload(item.id, file);
                    }}
                    disabled={uploadingItemIds.has(item.id)}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                )}
                {errors[`item-${item.id}-image`] && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors[`item-${item.id}-image`]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between">
          <span className="font-medium text-gray-700">Subtotal:</span>
          <span className="font-medium">
            {formData.currency} {formData.subtotal.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <label htmlFor="tax" className="font-medium text-gray-700">
            Tax:
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="tax"
              type="number"
              min="0"
              step="0.01"
              value={formData.tax || ''}
              onChange={e =>
                updateField(
                  'tax',
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              className="w-32"
            />
            <span className="font-medium">{formData.currency}</span>
          </div>
        </div>
        <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
          <span>Total:</span>
          <span>
            {formData.currency} {formData.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Business Information */}
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Business Information
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="business_name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Business Name
            </label>
            <Input
              id="business_name"
              type="text"
              value={formData.business_name || ''}
              onChange={e =>
                updateField('business_name', e.target.value || null)
              }
            />
          </div>
          <div>
            <label
              htmlFor="business_address"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Address
            </label>
            <Input
              id="business_address"
              type="text"
              value={formData.business_address || ''}
              onChange={e =>
                updateField('business_address', e.target.value || null)
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="business_phone"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Phone
              </label>
              <Input
                id="business_phone"
                type="text"
                value={formData.business_phone || ''}
                onChange={e =>
                  updateField('business_phone', e.target.value || null)
                }
              />
            </div>
            <div>
              <label
                htmlFor="business_email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <Input
                id="business_email"
                type="email"
                value={formData.business_email || ''}
                onChange={e =>
                  updateField('business_email', e.target.value || null)
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Banking Information */}
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Banking Information
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="bank_account_holder"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Account Holder
            </label>
            <Input
              id="bank_account_holder"
              type="text"
              value={formData.bank_account_holder || ''}
              onChange={e =>
                updateField('bank_account_holder', e.target.value || null)
              }
            />
          </div>
          <div>
            <label
              htmlFor="bank_name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Bank Name
            </label>
            <Input
              id="bank_name"
              type="text"
              value={formData.bank_name || ''}
              onChange={e => updateField('bank_name', e.target.value || null)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="bank_swift_code"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                SWIFT Code
              </label>
              <Input
                id="bank_swift_code"
                type="text"
                value={formData.bank_swift_code || ''}
                onChange={e =>
                  updateField('bank_swift_code', e.target.value || null)
                }
              />
            </div>
            <div>
              <label
                htmlFor="bank_account_number"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Account Number
              </label>
              <Input
                id="bank_account_number"
                type="text"
                value={formData.bank_account_number || ''}
                onChange={e =>
                  updateField('bank_account_number', e.target.value || null)
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Additional Information
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="default_conditions"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Terms & Conditions
            </label>
            <textarea
              id="default_conditions"
              value={formData.default_conditions || ''}
              onChange={e =>
                updateField('default_conditions', e.target.value || null)
              }
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="default_exchange_rate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Exchange Rate
            </label>
            <Input
              id="default_exchange_rate"
              type="text"
              value={formData.default_exchange_rate || ''}
              onChange={e =>
                updateField('default_exchange_rate', e.target.value || null)
              }
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes || ''}
          onChange={e => updateField('notes', e.target.value || null)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error Message */}
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {errors.submit}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button type="button" onClick={onClose} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? 'Saving...'
            : isEditing
              ? 'Update Invoice'
              : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}

export default InvoiceForm;
