// src/app/invoices/hooks/useInvoiceSettings.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/apiFetch';

export type InvoiceSettings = {
  business_name: string;
  business_address: string;
  business_phone: string;
  business_email: string;

  bank_account_holder: string;
  bank_name: string;
  bank_swift_code: string;
  bank_account_number: string;

  default_currency: string;
  default_conditions: string;
  default_exchange_rate: string; // input-friendly
};

const EMPTY: InvoiceSettings = {
  business_name: 'HC Violins',
  business_address: '',
  business_phone: '',
  business_email: '',

  bank_account_holder: '',
  bank_name: '',
  bank_swift_code: '',
  bank_account_number: '',

  default_currency: 'USD',
  default_conditions: '',
  default_exchange_rate: '',
};

export function useInvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettings>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/invoice-settings');
      const json = await res.json();
      const data = json?.data ?? {};

      setSettings({
        business_name: data.business_name ?? 'HC Violins',
        business_address: data.business_address ?? '',
        business_phone: data.business_phone ?? '',
        business_email: data.business_email ?? '',

        bank_account_holder: data.bank_account_holder ?? '',
        bank_name: data.bank_name ?? '',
        bank_swift_code: data.bank_swift_code ?? '',
        bank_account_number: data.bank_account_number ?? '',

        default_currency: data.default_currency ?? 'USD',
        default_conditions: data.default_conditions ?? '',
        default_exchange_rate:
          data.default_exchange_rate === null ||
          data.default_exchange_rate === undefined
            ? ''
            : String(data.default_exchange_rate),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = useCallback(
    async (next: InvoiceSettings) => {
      setSaving(true);
      try {
        const payload = {
          ...next,
          default_exchange_rate: next.default_exchange_rate
            ? Number(next.default_exchange_rate)
            : null,
        };

        const res = await apiFetch('/api/invoice-settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Failed to save settings: ${res.status}`);
        }

        // re-fetch canonical (server-normalized) values
        await fetchSettings();
      } finally {
        setSaving(false);
      }
    },
    [fetchSettings]
  );

  return {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
  };
}
