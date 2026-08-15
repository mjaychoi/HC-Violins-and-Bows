import { createClientInputToDbRow } from '@/utils/clientDbMap';

export type PendingClientCreateOperation = {
  key: string;
  payloadFingerprint: string;
};

type ClientCreateFields = {
  first_name?: string | null;
  last_name?: string | null;
  contact_number?: string | null;
  email?: string | null;
  tags?: string[] | null;
  interest?: string | null;
  note?: string | null;
};

type InstrumentLinkFingerprint = {
  instrument_id: string;
  relationship_type: string;
  notes?: string | null;
};

export function generateClientCreateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizedClientCreateFields(client: ClientCreateFields) {
  const row = createClientInputToDbRow({
    first_name: client.first_name ?? null,
    last_name: client.last_name ?? null,
    contact_number: client.contact_number ?? null,
    email: client.email ?? null,
    client_number: null,
    tags: client.tags ?? [],
    interest: client.interest ?? null,
    note: client.note ?? null,
  });

  return {
    name: row.name.trim(),
    email: row.email,
    phone: row.phone,
    tags: row.tags ?? [],
    interest: row.interest,
    note: row.note,
  };
}

export function fingerprintPlainClientCreate(
  client: ClientCreateFields
): string {
  return JSON.stringify(normalizedClientCreateFields(client));
}

export function fingerprintClientCreateWithConnections(
  client: ClientCreateFields,
  instrumentLinks: InstrumentLinkFingerprint[]
): string {
  const sortedLinks = [...instrumentLinks].sort((a, b) =>
    a.instrument_id.localeCompare(b.instrument_id)
  );

  return JSON.stringify({
    ...normalizedClientCreateFields(client),
    instrumentLinks: sortedLinks.map(link => ({
      instrument_id: link.instrument_id,
      relationship_type: link.relationship_type,
      notes: link.notes ?? null,
    })),
  });
}

export function resolveClientCreateOperation(
  pending: PendingClientCreateOperation | null,
  payloadFingerprint: string,
  prefix: string
): PendingClientCreateOperation {
  if (pending && pending.payloadFingerprint === payloadFingerprint) {
    return pending;
  }

  return {
    key: generateClientCreateIdempotencyKey(prefix),
    payloadFingerprint,
  };
}
