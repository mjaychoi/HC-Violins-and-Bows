import { Client, Instrument, ClientInstrument } from '@/types';

// Connection formatting utilities
export const formatClientName = (client?: Client): string => {
  if (!client) return 'Unknown Client';
  return (
    `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
    'Unknown Client'
  );
};

export const formatInstrumentName = (instrument?: Instrument): string => {
  if (!instrument) return 'Unknown Instrument';
  return `${instrument.maker || 'Unknown'} - ${instrument.type || 'Unknown'}`.trim();
};

export const formatConnectionName = (connection: ClientInstrument): string => {
  const clientName = formatClientName(connection.client);
  const instrumentName = formatInstrumentName(connection.instrument);
  return `${clientName} ↔ ${instrumentName}`;
};

// Connection filtering utilities
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
export const getRelationshipColor = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  switch (relationshipType) {
    case 'Interested':
      return 'bg-yellow-100 text-yellow-800';
    case 'Booked':
      return 'bg-blue-100 text-blue-800';
    case 'Sold':
      return 'bg-green-100 text-green-800';
    case 'Owned':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getRelationshipIcon = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  switch (relationshipType) {
    case 'Interested':
      return '👀';
    case 'Booked':
      return '📅';
    case 'Sold':
      return '✅';
    case 'Owned':
      return '🏠';
    default:
      return '❓';
  }
};
