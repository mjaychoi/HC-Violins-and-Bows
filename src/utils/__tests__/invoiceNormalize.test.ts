import { normalizeSupabaseInvoiceItemsJoin } from '../invoiceNormalize';

const ITEM_ID = '123e4567-e89b-12d3-a456-426614174010';
const INVOICE_ID = '123e4567-e89b-12d3-a456-426614174000';

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    invoice_id: INVOICE_ID,
    instrument_id: '123e4567-e89b-12d3-a456-426614174002',
    description: 'Violin',
    qty: 1,
    rate: 3000,
    amount: 3000,
    image_url: null,
    display_order: 0,
    created_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeSupabaseInvoiceItemsJoin instrument embed', () => {
  it('keeps serial_number from an aliased instrument object', () => {
    const items = normalizeSupabaseInvoiceItemsJoin([
      itemRow({ instrument: { serial_number: 'SN12345', cost_price: 1500 } }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].instrument?.serial_number).toBe('SN12345');
    expect(items[0].instrument).not.toHaveProperty('cost_price');
    expect(items[0].instrument).not.toHaveProperty('consignment_price');
  });

  it('accepts PostgREST instruments (plural) embeds and array joins', () => {
    const items = normalizeSupabaseInvoiceItemsJoin([
      itemRow({
        instruments: [{ serial_number: 'SN-ARRAY', consignment_price: 800 }],
      }),
    ]);

    expect(items[0].instrument?.serial_number).toBe('SN-ARRAY');
    expect(items[0].instrument).not.toHaveProperty('consignment_price');
  });

  it('omits instrument when the embed is missing', () => {
    const items = normalizeSupabaseInvoiceItemsJoin([itemRow()]);
    expect(items[0].instrument).toBeUndefined();
  });
});
