import { Client, Instrument, ClientInstrument } from '@/types';
// ✅ FIXED: Use centralized color tokens
import { getRelationshipColor as getRelationshipColorFromTokens } from '@/utils/colorTokens';

// Connection formatting utilities
//
// "Unavailable client/instrument" is an intentional fallback for a
// *missing* reference (the joined row could not be found/loaded), distinct
// from a client/instrument that exists but simply has no name/maker/type on
// file. We never want to render "undefined - undefined" or a bare "Unknown"
// unless it is an actual product label for known-but-unnamed data.
export const formatClientName = (client?: Client | null): string => {
  if (!client) return 'Unavailable client';
  const name = `${client.first_name || ''} ${client.last_name || ''}`.trim();
  if (name) return name;
  if (client.email) return client.email;
  return 'Unnamed client';
};

export const formatInstrumentName = (
  instrument?: Instrument | null
): string => {
  if (!instrument) return 'Unavailable instrument';
  const parts = [instrument.maker, instrument.type].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  return parts.length > 0 ? parts.join(' - ') : 'Unnamed instrument';
};

export const formatConnectionName = (connection: ClientInstrument): string => {
  const clientName = formatClientName(connection.client);
  const instrumentName = formatInstrumentName(connection.instrument);
  return `${clientName} ↔ ${instrumentName}`;
};

// Connection filtering utilities
// @deprecated These functions are deprecated. Use useFilterSort hook instead for consistent filtering.
// Kept for backwards compatibility with tests only.
export const filterClients = (
  clients: Client[],
  searchTerm: string
): Client[] => {
  if (!searchTerm) return clients;

  return clients.filter(
    client =>
      client.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );
};

/** @deprecated Use useFilterSort hook instead */
export const filterInstruments = (
  instruments: Instrument[],
  searchTerm: string
): Instrument[] => {
  if (!searchTerm) return instruments;

  return instruments.filter(
    instrument =>
      instrument.maker?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instrument.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );
};

/** @deprecated Use useFilterSort hook instead */
export const filterConnections = (
  connections: ClientInstrument[],
  searchTerm: string
): ClientInstrument[] => {
  if (!searchTerm) return connections;

  return connections.filter(connection => {
    const clientName = formatClientName(connection.client);
    const instrumentName = formatInstrumentName(connection.instrument);
    const searchLower = searchTerm.toLowerCase();

    return (
      clientName.toLowerCase().includes(searchLower) ||
      instrumentName.toLowerCase().includes(searchLower) ||
      connection.relationship_type.toLowerCase().includes(searchLower)
    );
  });
};

// Connection status utilities
// @deprecated Use getRelationshipTypeStyle from relationshipStyles.ts instead
// These functions are kept for backward compatibility with tests only
export const getRelationshipColor = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  return getRelationshipColorFromTokens(relationshipType);
};

// @deprecated Use getRelationshipTypeStyle from relationshipStyles.ts instead
export const getRelationshipIcon = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  switch (relationshipType) {
    case 'Interested':
      return '💡';
    case 'Booked':
      return '📅';
    case 'Sold':
      return '✅';
    case 'Owned':
      return '🏠';
    default:
      return '📋';
  }
};
