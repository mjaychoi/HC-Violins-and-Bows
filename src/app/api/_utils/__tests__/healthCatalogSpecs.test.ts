import {
  getMissingRequiredColumns,
  getMissingRuntimeContracts,
} from '../healthCatalogSpecs';

describe('healthCatalogSpecs helpers', () => {
  it('detects missing required columns', () => {
    const missing = getMissingRequiredColumns([
      'public.invoices.invoice_number',
      'public.clients.client_number',
    ]);

    expect(missing).toContain('public.invoice_settings.business_name');
    expect(missing).not.toContain('public.invoices.invoice_number');
  });

  it('treats absent runtime contract view as missing contracts', () => {
    expect(getMissingRuntimeContracts(null)).toEqual([
      'public.api_create_idempotency table',
      'public.api_create_idempotency required columns',
      'public.api_create_idempotency scoped uniqueness',
      'public.create_connection_atomic org-scoped parent checks',
    ]);
  });

  it('detects failed runtime contract checks', () => {
    expect(
      getMissingRuntimeContracts({
        api_create_idempotency_exists: true,
        api_create_idempotency_columns_ok: false,
        api_create_idempotency_unique_ok: true,
        create_connection_atomic_hardened: true,
      })
    ).toEqual(['public.api_create_idempotency required columns']);
  });
});
