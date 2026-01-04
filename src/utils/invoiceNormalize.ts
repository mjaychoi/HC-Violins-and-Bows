import type { Client, InvoiceItem, Invoice } from '@/types';
import { sanitizeNumber, validateUUID } from '@/utils/inputValidation';

type NormalizedClient = {
  client: Client | null;
  missingCreatedAt: boolean;
};

export function normalizeSupabaseClientJoin(raw: unknown): NormalizedClient {
  let clientData: Record<string, unknown> | null = null;
  let missingCreatedAt = false;

  if (Array.isArray(raw) && raw.length > 0) {
    if (typeof raw[0] === 'object' && raw[0] !== null) {
      clientData = raw[0] as Record<string, unknown>;
    }
  } else if (typeof raw === 'object' && raw !== null) {
    clientData = raw as Record<string, unknown>;
  }

  const id =
    clientData && typeof clientData.id === 'string' ? clientData.id : null;

  if (!clientData || !id || !validateUUID(id)) {
    return { client: null, missingCreatedAt: false };
  }

  const createdAt =
    typeof clientData.created_at === 'string' ? clientData.created_at : null;
  if (!createdAt) {
    missingCreatedAt = true;
  }

  const tags = Array.isArray(clientData.tags)
    ? clientData.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return {
    client: {
      id,
      first_name: (clientData.first_name as string | null) ?? null,
      last_name: (clientData.last_name as string | null) ?? null,
      email: (clientData.email as string | null) ?? null,
      contact_number: (clientData.contact_number as string | null) ?? null,
      address: (clientData.address as string | null) ?? null,
      tags,
      interest: (clientData.interest as string | null) ?? null,
      note: (clientData.note as string | null) ?? null,
      client_number: (clientData.client_number as string | null) ?? null,
      type: (clientData.type as Client['type']) ?? undefined,
      status: (clientData.status as Client['status']) ?? undefined,
      created_at: createdAt ?? '',
    },
    missingCreatedAt,
  };
}

function normalizeInvoiceItem(raw: unknown): InvoiceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : null;
  const invoiceId =
    typeof record.invoice_id === 'string' ? record.invoice_id : null;
  const createdAt =
    typeof record.created_at === 'string' ? record.created_at : null;

  if (!id || !invoiceId || !createdAt) return null;
  if (!validateUUID(id) || !validateUUID(invoiceId)) return null;

  if (typeof record.description !== 'string') return null;

  const qty = sanitizeNumber(record.qty, undefined, undefined, false);
  const rate = sanitizeNumber(record.rate, undefined, undefined, false);
  const amount = sanitizeNumber(record.amount, undefined, undefined, false);

  if (qty === null || rate === null || amount === null) return null;
  if (!Number.isInteger(qty) || qty <= 0) return null;
  if (rate < 0 || amount < 0) return null;

  const instrumentId =
    typeof record.instrument_id === 'string' &&
    validateUUID(record.instrument_id)
      ? record.instrument_id
      : null;

  return {
    id,
    invoice_id: invoiceId,
    instrument_id: instrumentId,
    description: record.description,
    qty,
    rate,
    amount,
    image_url: (record.image_url as string | null) ?? null,
    display_order: sanitizeNumber(record.display_order) ?? 0,
    created_at: createdAt,
    instrument: record.instrument as InvoiceItem['instrument'],
  };
}

export function normalizeSupabaseInvoiceItemsJoin(raw: unknown): InvoiceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => normalizeInvoiceItem(item))
    .filter((item): item is InvoiceItem => item !== null);
}

type NormalizeResult = {
  normalized: Invoice;
  metadata: {
    missingClientCreatedAt: boolean;
  };
};

export function normalizeInvoiceRecord(
  raw: Record<string, unknown>
): NormalizeResult {
  const normalized: Record<string, unknown> = { ...raw };
  const { client, missingCreatedAt } = normalizeSupabaseClientJoin(
    raw.clients ?? raw.client
  );

  if (client) {
    normalized.client = client;
  } else {
    delete normalized.client;
  }
  delete normalized.clients;

  const items = normalizeSupabaseInvoiceItemsJoin(
    raw.invoice_items ?? raw.items
  );
  if (items.length > 0) {
    normalized.items = items;
  } else {
    delete normalized.items;
  }
  delete normalized.invoice_items;

  if (!normalized.currency) normalized.currency = 'USD';
  if (!normalized.status) normalized.status = 'draft';

  const subtotal = sanitizeNumber(
    normalized.subtotal,
    undefined,
    undefined,
    false
  );
  normalized.subtotal = subtotal ?? 0;

  const total = sanitizeNumber(normalized.total, undefined, undefined, false);
  normalized.total = total ?? 0;

  if (normalized.tax === undefined || normalized.tax === null) {
    normalized.tax = null;
  } else {
    normalized.tax = sanitizeNumber(
      normalized.tax,
      undefined,
      undefined,
      false
    );
  }

  // Normalize optional invoice settings fields (set to null if undefined)
  const optionalFields = [
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
    'bank_account_holder',
    'bank_name',
    'bank_swift_code',
    'bank_account_number',
    'default_conditions',
    'default_exchange_rate',
  ];

  for (const field of optionalFields) {
    if (normalized[field] === undefined) {
      normalized[field] = null;
    }
  }

  return {
    normalized: normalized as unknown as Invoice,
    metadata: {
      missingClientCreatedAt: missingCreatedAt,
    },
  };
}
