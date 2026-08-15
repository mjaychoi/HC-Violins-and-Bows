import type { Client, ClientInstrument, Instrument } from '@/types';

/**
 * Resolve Client/Instrument identity for Connection display and search.
 *
 * Canonical entities (looked up by client_id / instrument_id only) win when
 * present. Embedded connection.client / connection.instrument are fallbacks
 * when the canonical collection is incomplete (paginated Clients page rows,
 * truncated instrument/client caches) or the related row is gone.
 *
 * Absence from a truncated local collection is not treated as "deleted".
 */
export function indexById<T extends { id: string }>(
  items: readonly T[]
): Map<string, T> {
  return new Map(items.map(item => [item.id, item]));
}

export function resolveConnectionClient(
  connection: ClientInstrument,
  canonicalClients: ReadonlyMap<string, Client>
): Client | null | undefined {
  return canonicalClients.get(connection.client_id) ?? connection.client;
}

export function resolveConnectionInstrument(
  connection: ClientInstrument,
  canonicalInstruments: ReadonlyMap<string, Instrument>
): Instrument | null | undefined {
  const canonical = canonicalInstruments.get(connection.instrument_id);
  if (!canonical) {
    return connection.instrument;
  }

  // Canonical snapshot wins every overlapping field so display/search never
  // mix a stale embed with a later canonical row.
  return connection.instrument
    ? { ...connection.instrument, ...canonical }
    : canonical;
}

export function resolveConnectionView(
  connection: ClientInstrument,
  canonicalClients: ReadonlyMap<string, Client>,
  canonicalInstruments: ReadonlyMap<string, Instrument>
): ClientInstrument {
  const client = resolveConnectionClient(connection, canonicalClients);
  const instrument = resolveConnectionInstrument(
    connection,
    canonicalInstruments
  );

  if (client === connection.client && instrument === connection.instrument) {
    return connection;
  }

  return {
    ...connection,
    client,
    instrument,
  };
}

export function resolveConnectionsView(
  connections: readonly ClientInstrument[],
  canonicalClients: readonly Client[],
  canonicalInstruments: readonly Instrument[]
): ClientInstrument[] {
  if (connections.length === 0) return [];

  const clientMap = indexById(canonicalClients);
  const instrumentMap = indexById(canonicalInstruments);

  let changed = false;
  const next = connections.map(connection => {
    const resolved = resolveConnectionView(
      connection,
      clientMap,
      instrumentMap
    );
    if (resolved !== connection) changed = true;
    return resolved;
  });

  return changed ? next : (connections as ClientInstrument[]);
}

/**
 * Searchable Connection text. Field set matches the shipped Connections page
 * (relationship, notes, client name/email/tags, instrument maker/type/year/price).
 * Callers must pass a canonical-resolved connection so stale embeds cannot match.
 */
export function buildConnectionSearchText(
  connection: ClientInstrument
): string {
  return [
    connection.relationship_type,
    connection.notes,
    connection.client?.first_name,
    connection.client?.last_name,
    connection.client?.email,
    ...(connection.client?.tags ?? []),
    connection.instrument?.maker,
    connection.instrument?.type,
    connection.instrument?.year?.toString(),
    connection.instrument?.price?.toString(),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function connectionMatchesSearch(
  connection: ClientInstrument,
  searchTerm: string
): boolean {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return true;
  return buildConnectionSearchText(connection).includes(term);
}

export function patchConnectionsRelatedClient(
  connections: readonly ClientInstrument[],
  client: Client
): ClientInstrument[] {
  let changed = false;
  const next = connections.map(connection => {
    if (connection.client_id !== client.id) return connection;
    changed = true;
    return {
      ...connection,
      client: connection.client ? { ...connection.client, ...client } : client,
    };
  });
  return changed ? next : (connections as ClientInstrument[]);
}

export function patchConnectionsRelatedInstrument(
  connections: readonly ClientInstrument[],
  instrument: Instrument
): ClientInstrument[] {
  let changed = false;
  const next = connections.map(connection => {
    if (connection.instrument_id !== instrument.id) return connection;
    changed = true;
    return {
      ...connection,
      instrument: connection.instrument
        ? { ...connection.instrument, ...instrument }
        : instrument,
    };
  });
  return changed ? next : (connections as ClientInstrument[]);
}
