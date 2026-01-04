'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/common/modals/Modal';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { Button } from '@/components/common/inputs';
import { logError } from '@/utils/logger';

type InvoiceSettings = {
  business_name: string;
  address: string;
  phone: string;
  email: string;

  bank_account_holder: string;
  bank_name: string;
  bank_swift_code: string;
  bank_account_number: string;

  default_conditions: string;
  default_exchange_rate: string;
  default_currency: string;
};

const empty: InvoiceSettings = {
  business_name: '',
  address: '',
  phone: '',
  email: '',
  bank_account_holder: '',
  bank_name: '',
  bank_swift_code: '',
  bank_account_number: '',
  default_conditions: '',
  default_exchange_rate: '',
  default_currency: 'USD',
};

interface InvoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function InvoiceSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: InvoiceSettingsModalProps) {
  const { showSuccess, handleError } = useAppFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<InvoiceSettings>(empty);

  const currencies = useMemo(
    () => ['USD', 'KRW', 'EUR', 'GBP', 'JPY', 'CNY'],
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/invoices/invoice_settings');

      // Check content type before parsing JSON
      const contentType = res.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      if (!res.ok) {
        let errorMessage = 'Failed to load invoice settings';
        try {
          if (isJson) {
            const errorData = await res.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            const text = await res.text();
            errorMessage = text || `HTTP ${res.status}: ${res.statusText}`;
          }
        } catch (parseError) {
          logError(
            'Failed to parse error response:',
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          );
          errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      if (!isJson) {
        throw new Error(`Expected JSON response but got ${contentType}`);
      }

      const json = await res.json();
      setForm({
        ...empty,
        ...(json.data || {}),
      });
    } catch (e) {
      logError(
        'Failed to load invoice settings:',
        e instanceof Error ? e.message : String(e)
      );
      handleError(
        e instanceof Error ? e.message : String(e),
        'Load invoice settings'
      );
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  const set = (k: keyof InvoiceSettings) => (v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/invoices/invoice_settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });

      const contentType = res.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      if (!res.ok) {
        let errorMessage = 'Failed to save invoice settings';
        try {
          if (isJson) {
            const errorData = await res.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            const text = await res.text();
            errorMessage = text || `HTTP ${res.status}: ${res.statusText}`;
          }
        } catch (parseError) {
          logError(
            'Failed to parse error response:',
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          );
          errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      showSuccess('Invoice settings saved successfully.');
      onSaved?.();
      onClose();
    } catch (e) {
      handleError(
        e instanceof Error ? e.message : String(e),
        'Save invoice settings'
      );
    } finally {
      setSaving(false);
    }
  }, [form, handleError, showSuccess, onSaved, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invoice Settings" size="lg">
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <>
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Set the company/bank/default conditions that will be used as
                default values when creating new invoices.
              </p>
            </div>

            <div className="space-y-4">
              <Field
                label="Business name"
                value={form.business_name}
                onChange={set('business_name')}
              />
              <Field
                label="Address"
                value={form.address}
                onChange={set('address')}
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Phone"
                  value={form.phone}
                  onChange={set('phone')}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                />
              </div>
              <Field
                label="Default currency"
                value={form.default_currency}
                onChange={set('default_currency')}
                selectOptions={currencies.map(c => ({ value: c, label: c }))}
              />
              <Field
                label="Default exchange rate (text)"
                value={form.default_exchange_rate}
                onChange={set('default_exchange_rate')}
              />
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Banking Information
              </h3>
              <div className="space-y-4">
                <Field
                  label="Account holder"
                  value={form.bank_account_holder}
                  onChange={set('bank_account_holder')}
                />
                <Field
                  label="Bank name"
                  value={form.bank_name}
                  onChange={set('bank_name')}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="SWIFT code"
                    value={form.bank_swift_code}
                    onChange={set('bank_swift_code')}
                  />
                  <Field
                    label="Account number"
                    value={form.bank_account_number}
                    onChange={set('bank_account_number')}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Default Conditions
              </h3>
              <Field
                label="Conditions"
                value={form.default_conditions}
                onChange={set('default_conditions')}
                textarea
                rows={6}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={save}
                disabled={saving}
                loading={saving}
              >
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  textarea = false,
  rows = 3,
  selectOptions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  rows?: number;
  selectOptions?: Array<{ value: string; label: string }>;
}) {
  if (textarea) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    );
  }

  if (selectOptions) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {selectOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
