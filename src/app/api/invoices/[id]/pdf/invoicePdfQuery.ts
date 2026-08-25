// PDF rendering only needs instrument.serial_number for the item-number
// field. `instruments (*)` is forbidden after
// 20260814160000_enforce_financial_confidentiality_db_boundary.sql because
// PostgREST expands `*` to include cost_price/consignment_price, which
// `authenticated` may not SELECT. Keep this embed on the granted
// serial_number column only.
export const INVOICE_PDF_SELECT = `
          *,
          clients (*),
          invoice_items (
            *,
            instrument:instruments ( serial_number )
          )
        `;

export const INVOICE_PDF_INSTRUMENT_COLUMNS = ['serial_number'] as const;
