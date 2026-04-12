/**
 * Maps between `public.clients` table shape (name, phone, …) and app `Client` (first_name, last_name, contact_number, …).
 */
import type { Client } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database';

/** Columns returned from Supabase for clients — must match DB. */
export const CLIENT_TABLE_SELECT =
  'id, org_id, client_number, name, email, phone, created_at, updated_at';

export type ClientsTableRow = {
  id: string;
  org_id?: string | null;
  client_number?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * DB row → API Client (legacy shape: full name in first_name).
 */
export function mapClientsTableRowToClient(row: ClientsTableRow): Client {
  const name = row.name?.trim() ?? '';
  return {
    id: row.id,
    first_name: name || null,
    last_name: null,
    email: row.email ?? null,
    contact_number: row.phone ?? null,
    tags: [],
    interest: null,
    note: null,
    client_number: row.client_number ?? null,
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
};

/** POST body (validated) → DB insert row. Omits columns that do not exist on `clients`. */
export function createClientInputToDbRow(
  data: CreateClientFields
): Pick<TablesInsert<'clients'>, 'name' | 'phone' | 'email' | 'client_number'> {
  const name =
    [data.first_name, data.last_name]
      .map(s => (s ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim() || '';

  return {
    name,
    phone: data.contact_number,
    email: data.email,
    client_number: data.client_number,
  };
}

type PartialClientFields = Partial<{
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
  email: string | null;
  client_number: string | null;
}>;

/**
 * Builds DB patch object. For name, merges with current `name` when only one of first/last is sent.
 */
export function mergePartialClientIntoDbPatch(
  currentName: string | null | undefined,
  updates: PartialClientFields
): TablesUpdate<'clients'> {
  const patch: TablesUpdate<'clients'> = {};

  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.contact_number !== undefined)
    patch.phone = updates.contact_number;
  if (updates.client_number !== undefined)
    patch.client_number = updates.client_number;

  if (updates.first_name !== undefined || updates.last_name !== undefined) {
    const parts = (currentName ?? '').trim().split(/\s+/).filter(Boolean);
    const first =
      updates.first_name !== undefined
        ? (updates.first_name ?? '').trim()
        : (parts[0] ?? '');
    const last =
      updates.last_name !== undefined
        ? (updates.last_name ?? '').trim()
        : parts.slice(1).join(' ').trim();
    const combined = [first, last].filter(Boolean).join(' ').trim();
    patch.name = combined;
  }

  return patch;
}
