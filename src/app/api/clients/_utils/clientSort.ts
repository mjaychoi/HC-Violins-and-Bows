/**
 * Canonical Client collection sort contract.
 *
 * UI header → canonical semantic key → supported server sort.
 * Legacy URL aliases resolve to the same canonical key so the active
 * sort arrow always matches the field the server actually orders by.
 *
 * Client Number ordering uses the numeric CL suffix (same pattern as
 * `max_cl_suffix_for_org`) and is applied to the full filtered set
 * before page slicing — never page-locally.
 */

export const CLIENT_SORT_DEFAULT_FIELD = 'created_at' as const;

export const CLIENT_CANONICAL_SORT_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'name',
  'email',
  'phone',
  'client_number',
  'interest',
] as const;

export type ClientCanonicalSortField =
  (typeof CLIENT_CANONICAL_SORT_FIELDS)[number];

/** Legacy query/UI keys → rebuilt DB/API columns. */
export const CLIENT_SORT_ALIASES: Record<string, ClientCanonicalSortField> = {
  first_name: 'name',
  last_name: 'name',
  contact_number: 'phone',
};

/**
 * Visible Client list columns. Unsupported display fields must not
 * expose a sort affordance (V2-004).
 */
export const CLIENT_LIST_COLUMNS = [
  { field: 'name', label: 'Name', sortable: true },
  { field: 'phone', label: 'Contact', sortable: true },
  { field: 'tags', label: 'Tags', sortable: false },
  { field: 'interest', label: 'Interest', sortable: true },
  { field: 'client_number', label: 'Client #', sortable: true },
] as const;

export type ClientListSortField = Extract<
  (typeof CLIENT_LIST_COLUMNS)[number],
  { sortable: true }
>['field'];

const CANONICAL_SET = new Set<string>(CLIENT_CANONICAL_SORT_FIELDS);

export function canonicalizeClientSortField(
  raw: string | null | undefined
): ClientCanonicalSortField {
  if (!raw) return CLIENT_SORT_DEFAULT_FIELD;
  const trimmed = raw.trim();
  if (!trimmed) return CLIENT_SORT_DEFAULT_FIELD;

  const mapped = CLIENT_SORT_ALIASES[trimmed] ?? trimmed;
  if (CANONICAL_SET.has(mapped)) {
    return mapped as ClientCanonicalSortField;
  }
  return CLIENT_SORT_DEFAULT_FIELD;
}

export function isClientListSortField(
  field: string
): field is ClientListSortField {
  return CLIENT_LIST_COLUMNS.some(
    column => column.sortable && column.field === field
  );
}

/**
 * Matches `max_cl_suffix_for_org`: `^cl[0-9]+$` (case-insensitive).
 * Returns the integer suffix, or null for null/empty/malformed values.
 */
export function parseClClientNumberSuffix(
  value: string | null | undefined
): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^cl(\d+)$/i);
  if (!match) return null;
  const suffix = Number.parseInt(match[1], 10);
  return Number.isFinite(suffix) ? suffix : null;
}

export type ClientNumberSortKey = {
  id: string;
  client_number: string | null | undefined;
};

/**
 * Numeric Client Number compare for the full filtered set.
 *
 * ASC: valid CL numbers by suffix, then nonstandard/null values
 * (text, then id). Secondary tie-break is always id ASC.
 * Invalid values stay after valid numeric values in both directions.
 */
export function compareClientNumberKeys(
  a: ClientNumberSortKey,
  b: ClientNumberSortKey,
  ascending: boolean
): number {
  const aSuffix = parseClClientNumberSuffix(a.client_number ?? null);
  const bSuffix = parseClClientNumberSuffix(b.client_number ?? null);
  const aValid = aSuffix !== null;
  const bValid = bSuffix !== null;

  if (aValid && bValid && aSuffix !== bSuffix) {
    return ascending ? aSuffix - bSuffix : bSuffix - aSuffix;
  }
  if (aValid && !bValid) return -1;
  if (!aValid && bValid) return 1;

  if (!aValid && !bValid) {
    const aText = (a.client_number ?? '').trim();
    const bText = (b.client_number ?? '').trim();
    const aMissing = a.client_number == null || aText.length === 0;
    const bMissing = b.client_number == null || bText.length === 0;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing && bMissing) {
      const aNull = a.client_number == null;
      const bNull = b.client_number == null;
      if (aNull !== bNull) return aNull ? 1 : -1;
    } else if (aText !== bText) {
      return aText.localeCompare(bText, 'en', { sensitivity: 'base' });
    }
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortClientNumberKeys<T extends ClientNumberSortKey>(
  rows: T[],
  ascending: boolean
): T[] {
  return [...rows].sort((a, b) => compareClientNumberKeys(a, b, ascending));
}

export function clientSortArrow(
  activeField: string,
  activeOrder: 'asc' | 'desc',
  column: string
): string {
  const requested = column.trim();
  const isKnownColumn =
    CANONICAL_SET.has(requested) || requested in CLIENT_SORT_ALIASES;
  if (!isKnownColumn) return '';

  if (
    canonicalizeClientSortField(activeField) !==
    canonicalizeClientSortField(requested)
  ) {
    return '';
  }
  return activeOrder === 'asc' ? '↑' : '↓';
}
