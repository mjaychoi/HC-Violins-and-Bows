/**
 * Maps between `public.clients` table shape (name, phone, …) and app `Client` (first_name, last_name, contact_number, …).
 */
import type { Client } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database';

/** Columns returned from Supabase for clients — must match DB. */
export const CLIENT_TABLE_SELECT =
  'id, org_id, client_number, name, email, phone, tags, interest, note, created_at, updated_at';

export type ClientsTableRow = {
  id: string;
  org_id?: string | null;
  client_number?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  interest?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeOptionalText(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeClientTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];

  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(Boolean);
}

/**
 * DB row → API Client (legacy shape: full name in first_name).
 */
export function mapClientsTableRowToClient(row: ClientsTableRow): Client {
  const name = normalizeOptionalText(row.name) ?? '';
  return {
    id: row.id,
    first_name: name || null,
    last_name: null,
    email: normalizeOptionalText(row.email),
    contact_number: normalizeOptionalText(row.phone),
    tags: normalizeClientTags(row.tags),
    interest: normalizeOptionalText(row.interest),
    note: normalizeOptionalText(row.note),
    client_number: normalizeOptionalText(row.client_number),
    type: undefined,
    status: undefined,
    created_at: row.created_at ?? '',
    address: undefined,
  };
}

type CreateClientFields = {
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
  email: string | null;
  client_number: string | null;
  tags: string[] | null;
  interest: string | null;
  note: string | null;
};

/** POST body (validated) → DB insert row. Omits columns that do not exist on `clients`. */
export function createClientInputToDbRow(
  data: CreateClientFields
): Pick<
  TablesInsert<'clients'>,
  'name' | 'phone' | 'email' | 'client_number' | 'tags' | 'interest' | 'note'
> {
  const name =
    [data.first_name, data.last_name]
      .map(s => normalizeOptionalText(s) ?? '')
      .filter(Boolean)
      .join(' ')
      .trim() || '';

  const tags = normalizeClientTags(data.tags);

  return {
    name,
    phone: normalizeOptionalText(data.contact_number),
    email: normalizeOptionalText(data.email),
    client_number: normalizeOptionalText(data.client_number),
    tags,
    interest: normalizeOptionalText(data.interest),
    note: normalizeOptionalText(data.note),
  };
}

type PartialClientFields = Partial<{
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
  email: string | null;
  client_number: string | null;
  tags: string[] | null;
  interest: string | null;
  note: string | null;
}>;

/**
 * Builds DB patch object. For name, merges with current `name` when only one of first/last is sent.
 */
export function mergePartialClientIntoDbPatch(
  currentName: string | null | undefined,
  updates: PartialClientFields
): TablesUpdate<'clients'> {
  const patch: TablesUpdate<'clients'> = {};

  if (updates.email !== undefined)
    patch.email = normalizeOptionalText(updates.email);
  if (updates.contact_number !== undefined)
    patch.phone = normalizeOptionalText(updates.contact_number);
  if (updates.client_number !== undefined)
    patch.client_number = normalizeOptionalText(updates.client_number);
  if (updates.tags !== undefined) {
    patch.tags = updates.tags === null ? [] : normalizeClientTags(updates.tags);
  }
  if (updates.interest !== undefined)
    patch.interest = normalizeOptionalText(updates.interest);
  if (updates.note !== undefined)
    patch.note = normalizeOptionalText(updates.note);

  if (updates.first_name !== undefined || updates.last_name !== undefined) {
    const parts = (currentName ?? '').trim().split(/\s+/).filter(Boolean);
    const first =
      updates.first_name !== undefined
        ? (normalizeOptionalText(updates.first_name) ?? '')
        : (parts[0] ?? '');
    const last =
      updates.last_name !== undefined
        ? (normalizeOptionalText(updates.last_name) ?? '')
        : parts.slice(1).join(' ').trim();
    const combined = [first, last].filter(Boolean).join(' ').trim();
    patch.name = combined;
  }

  return patch;
}
