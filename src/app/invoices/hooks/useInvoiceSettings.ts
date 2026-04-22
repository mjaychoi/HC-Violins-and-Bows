// src/app/invoices/hooks/useInvoiceSettings.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/apiFetch';
import {
  createApiResponseErrorFromResponse,
  handleApiResponse,
} from '@/utils/handleApiResponse';

const INVOICE_SETTINGS_API_PATH = '/api/invoices/invoice_settings';

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
      const res = await apiFetch(INVOICE_SETTINGS_API_PATH);
      const data =
        (await handleApiResponse<Record<string, unknown> | null>(
          res,
          'Failed to load invoice settings',
          { allowNullData: true }
        )) ?? {};

      setSettings({
        business_name:
          typeof data.business_name === 'string'
            ? data.business_name
            : 'HC Violins',
        business_address:
          typeof data.business_address === 'string'
            ? data.business_address
            : '',
        business_phone:
          typeof data.business_phone === 'string' ? data.business_phone : '',
        business_email:
          typeof data.business_email === 'string' ? data.business_email : '',

        bank_account_holder:
          typeof data.bank_account_holder === 'string'
            ? data.bank_account_holder
            : '',
        bank_name: typeof data.bank_name === 'string' ? data.bank_name : '',
        bank_swift_code:
          typeof data.bank_swift_code === 'string' ? data.bank_swift_code : '',
        bank_account_number:
          typeof data.bank_account_number === 'string'
            ? data.bank_account_number
            : '',

        default_currency:
          typeof data.default_currency === 'string'
            ? data.default_currency
            : 'USD',
        default_conditions:
          typeof data.default_conditions === 'string'
            ? data.default_conditions
            : '',
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

        const res = await apiFetch(INVOICE_SETTINGS_API_PATH, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw await createApiResponseErrorFromResponse(
            res,
            'Failed to save settings'
          );
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
