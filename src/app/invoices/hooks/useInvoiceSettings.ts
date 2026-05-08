// src/app/invoices/hooks/useInvoiceSettings.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/apiFetch';
import {
  createApiResponseErrorFromResponse,
  handleApiResponse,
} from '@/utils/handleApiResponse';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

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

function normalizeInvoiceSettings(
  data: Record<string, unknown> | null | undefined
): InvoiceSettings {
  return {
    business_name:
      typeof data?.business_name === 'string'
        ? data.business_name
        : EMPTY.business_name,
    business_address:
      typeof data?.business_address === 'string'
        ? data.business_address
        : typeof data?.address === 'string'
          ? data.address
          : EMPTY.business_address,
    business_phone:
      typeof data?.business_phone === 'string'
        ? data.business_phone
        : typeof data?.phone === 'string'
          ? data.phone
          : EMPTY.business_phone,
    business_email:
      typeof data?.business_email === 'string'
        ? data.business_email
        : typeof data?.email === 'string'
          ? data.email
          : EMPTY.business_email,

    bank_account_holder:
      typeof data?.bank_account_holder === 'string'
        ? data.bank_account_holder
        : EMPTY.bank_account_holder,
    bank_name:
      typeof data?.bank_name === 'string' ? data.bank_name : EMPTY.bank_name,
    bank_swift_code:
      typeof data?.bank_swift_code === 'string'
        ? data.bank_swift_code
        : EMPTY.bank_swift_code,
    bank_account_number:
      typeof data?.bank_account_number === 'string'
        ? data.bank_account_number
        : EMPTY.bank_account_number,

    default_currency:
      typeof data?.default_currency === 'string'
        ? data.default_currency
        : EMPTY.default_currency,
    default_conditions:
      typeof data?.default_conditions === 'string'
        ? data.default_conditions
        : EMPTY.default_conditions,
    default_exchange_rate:
      data?.default_exchange_rate === null ||
      data?.default_exchange_rate === undefined
        ? EMPTY.default_exchange_rate
        : String(data.default_exchange_rate),
  };
}

export function useInvoiceSettings() {
  const { tenantIdentityKey, isTenantTransitioning } = useTenantIdentity();
  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [settings, setSettings] = useState<InvoiceSettings>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    tenantIdentityKeyRef.current = tenantIdentityKey;
    requestIdRef.current += 1;
    abortRef.current?.abort();
    setSettings(EMPTY);
    setError(null);
    setLoading(false);
    setSaving(false);
  }, [tenantIdentityKey]);

  const fetchSettings = useCallback(async () => {
    if (isTenantTransitioning) return;

    const startedTenantIdentityKey = tenantIdentityKeyRef.current;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(INVOICE_SETTINGS_API_PATH, {
        signal: controller.signal,
      });
      if (
        requestId !== requestIdRef.current ||
        tenantIdentityKeyRef.current !== startedTenantIdentityKey
      ) {
        return;
      }

      const data =
        (await handleApiResponse<Record<string, unknown> | null>(
          res,
          'Failed to load invoice settings',
          { allowNullData: true }
        )) ?? {};

      if (
        requestId !== requestIdRef.current ||
        tenantIdentityKeyRef.current !== startedTenantIdentityKey
      ) {
        return;
      }

      setSettings(normalizeInvoiceSettings(data));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        return;
      }
      if (
        requestId !== requestIdRef.current ||
        tenantIdentityKeyRef.current !== startedTenantIdentityKey
      ) {
        return;
      }
      setError(caught);
    } finally {
      if (
        requestId === requestIdRef.current &&
        tenantIdentityKeyRef.current === startedTenantIdentityKey
      ) {
        setLoading(false);
      }
    }
  }, [isTenantTransitioning]);

  useEffect(() => {
    fetchSettings();
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
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
    error,
    fetchSettings,
    saveSettings,
  };
}
