/**
 * Maps between `public.clients` table shape (name, phone, …) and app `Client` (first_name, last_name, contact_number, …).
 */
import type { Client } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database';

/** Columns returned from Supabase for clients — must match DB. */
export const CLIENT_TABLE_SELECT =
  'id, org_id, client_number, name, first_name, last_name, email, phone, tags, interest, note, created_at, updated_at';

export type ClientsTableRow = {
  id: string;
  org_id?: string | null;
  client_number?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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

function splitLegacyName(name: string | null): {
  first_name: string | null;
  last_name: string | null;
} {
  const normalized = normalizeOptionalText(name);
  if (!normalized) {
    return { first_name: null, last_name: null };
  }

  const spaceIdx = normalized.indexOf(' ');
  if (spaceIdx > -1) {
    return {
      first_name: normalized.slice(0, spaceIdx),
      last_name: normalizeOptionalText(normalized.slice(spaceIdx + 1)),
    };
  }

  return { first_name: normalized, last_name: null };
}

function combineClientNameParts(
  first_name: string | null | undefined,
  last_name: string | null | undefined
): string {
  return [first_name, last_name]
    .map(part => normalizeOptionalText(part) ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * DB row → API Client. Prefers stored first_name / last_name; falls back to legacy name split.
 */
export function mapClientsTableRowToClient(row: ClientsTableRow): Client {
  const hasStoredParts =
    row.first_name !== undefined || row.last_name !== undefined;

  const first_name = hasStoredParts
    ? normalizeOptionalText(row.first_name)
    : splitLegacyName(row.name ?? null).first_name;
  const last_name = hasStoredParts
    ? normalizeOptionalText(row.last_name)
    : splitLegacyName(row.name ?? null).last_name;

  return {
    id: row.id,
    first_name,
    last_name,
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
  | 'name'
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'email'
  | 'client_number'
  | 'tags'
  | 'interest'
  | 'note'
> {
  const first_name = normalizeOptionalText(data.first_name);
  const last_name = normalizeOptionalText(data.last_name);
  const name = combineClientNameParts(first_name, last_name);
  const tags = normalizeClientTags(data.tags);

  return {
    name,
    first_name,
    last_name,
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

type CurrentClientNameFields = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
};

/**
 * Builds DB patch object. Updates first_name / last_name directly and keeps name in sync.
 */
export function mergePartialClientIntoDbPatch(
  current: CurrentClientNameFields,
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
    const legacy = splitLegacyName(current.name ?? null);
    const first =
      updates.first_name !== undefined
        ? normalizeOptionalText(updates.first_name)
        : (normalizeOptionalText(current.first_name) ?? legacy.first_name);
    const last =
      updates.last_name !== undefined
        ? normalizeOptionalText(updates.last_name)
        : (normalizeOptionalText(current.last_name) ?? legacy.last_name);

    patch.first_name = first;
    patch.last_name = last;
    patch.name = combineClientNameParts(first, last);
  }

  return patch;
}
