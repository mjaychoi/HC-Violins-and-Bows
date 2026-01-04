'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function InvoiceSettingsPanel({
  onSaved,
}: {
  onSaved?: () => void;
}) {
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
    void load();
  }, [load]);

  const set = (k: keyof InvoiceSettings) => (v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/invoices/invoice_settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        let errorMessage = 'Failed to save invoice settings';
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const json = await res.json();
      setForm({ ...empty, ...(json.data || {}) });
      showSuccess('Invoice settings saved');
      onSaved?.();
    } catch (e) {
      logError(
        'Failed to save invoice settings:',
        e instanceof Error ? e.message : String(e)
      );
      handleError(
        e instanceof Error ? e.message : String(e),
        'Save invoice settings'
      );
    } finally {
      setSaving(false);
    }
  }, [form, handleError, onSaved, showSuccess]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="text-sm text-gray-600">Loading invoice settings...</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Invoice Settings
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Set the company/bank/default conditions that will be used in the
            PDF.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Business name"
          value={form.business_name}
          onChange={set('business_name')}
        />
        <Field label="Email" value={form.email} onChange={set('email')} />

        <Field label="Phone" value={form.phone} onChange={set('phone')} />
        <Field
          label="Default currency"
          value={form.default_currency}
          onChange={set('default_currency')}
          as="select"
          options={currencies}
        />

        <Field
          label="Address"
          value={form.address}
          onChange={set('address')}
          textarea
        />
        <Field
          label="Default exchange rate (text)"
          value={form.default_exchange_rate}
          onChange={set('default_exchange_rate')}
          textarea
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Banking Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
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

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Default Conditions
        </h3>
        <Field
          label="Conditions"
          value={form.default_conditions}
          onChange={set('default_conditions')}
          textarea
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
  as,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  as?: 'select';
  options?: string[];
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-gray-700 mb-1">{label}</div>
      {as === 'select' ? (
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {(options || []).map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : textarea ? (
        <textarea
          className="w-full min-h-[84px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
