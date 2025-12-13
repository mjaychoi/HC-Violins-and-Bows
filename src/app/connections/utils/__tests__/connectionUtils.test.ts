import {
  filterClients,
  filterConnections,
  filterInstruments,
  formatClientName,
  formatConnectionName,
  formatInstrumentName,
  getRelationshipColor,
  getRelationshipIcon,
} from '../connectionUtils';
import { Client, ClientInstrument, Instrument } from '@/types';

const clientA: Client = {
  id: 'c1',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@example.com',
  contact_number: '010-1234-5678',
  tags: [],
  interest: 'Active',
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
};

const clientB: Client = {
  ...clientA,
  id: 'c2',
  first_name: 'John',
  last_name: 'Smith',
  email: 'john.smith@example.com',
  client_number: 'CL002',
};

const instrumentA: Instrument = {
  id: 'i1',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1721,
  certificate: true,
  size: null,
  weight: null,
  price: null,
  ownership: null,
  note: null,
  serial_number: null,
  status: 'Available',
  created_at: '2024-01-01',
};

const instrumentB: Instrument = {
  ...instrumentA,
  id: 'i2',
  maker: 'Guarneri',
  type: 'Cello',
};

const makeConnection = (
  id: string,
  relationship_type: ClientInstrument['relationship_type'],
  client?: Client,
  instrument?: Instrument
): ClientInstrument => ({
  id,
  client_id: client?.id || 'c-unknown',
  instrument_id: instrument?.id || 'i-unknown',
  relationship_type,
  notes: null,
  created_at: '2024-01-01',
  client,
  instrument,
});

describe('connectionUtils formatting helpers', () => {
  it('formats client and instrument names with fallbacks', () => {
    expect(formatClientName(clientA)).toBe('Jane Doe');
    expect(
      formatClientName({ ...clientA, first_name: null, last_name: null })
    ).toBe('Unknown Client');

    expect(formatInstrumentName(instrumentA)).toBe('Stradivari - Violin');
    expect(
      formatInstrumentName({ ...instrumentA, maker: null, type: null })
    ).toBe('Unknown - Unknown');
  });

  it('builds a connection display name', () => {
    const connection = makeConnection(
      'rel1',
      'Interested',
      clientA,
      instrumentA
    );
    expect(formatConnectionName(connection)).toBe(
      'Jane Doe ↔ Stradivari - Violin'
    );
  });
});

describe('connectionUtils filtering helpers', () => {
  const clients = [clientA, clientB];
  const instruments = [instrumentA, instrumentB];
  const connections = [
    makeConnection('rel1', 'Interested', clientA, instrumentA),
    makeConnection('rel2', 'Booked', clientB, instrumentB),
  ];

  it('filters clients by first name, last name, or email (case-insensitive)', () => {
    expect(filterClients(clients, 'doe')).toEqual([clientA]);
    expect(filterClients(clients, 'JOHN')).toEqual([clientB]);
    expect(filterClients(clients, 'example.com')).toHaveLength(2);
    expect(filterClients(clients, '')).toBe(clients);
  });

  it('filters instruments by maker or type', () => {
    expect(filterInstruments(instruments, 'strad')).toEqual([instrumentA]);
    expect(filterInstruments(instruments, 'cello')).toEqual([instrumentB]);
    expect(filterInstruments(instruments, '')).toBe(instruments);
  });

  it('filters connections by client name, instrument name, or relationship type', () => {
    expect(filterConnections(connections, 'jane')).toEqual([connections[0]]);
    expect(filterConnections(connections, 'cello')).toEqual([connections[1]]);
    expect(filterConnections(connections, 'booked')).toEqual([connections[1]]);
    expect(filterConnections(connections, '')).toBe(connections);
  });
});

describe('connectionUtils relationship presentation helpers', () => {
  it('returns relationship colors and icons with defaults', () => {
    expect(getRelationshipColor('Interested')).toBe(
      'bg-yellow-100 text-yellow-800'
    );
    expect(getRelationshipColor('Sold')).toBe('bg-green-100 text-green-800');
    expect(getRelationshipColor('Owned')).toBe('bg-purple-100 text-purple-800');
    expect(getRelationshipColor('Booked')).toBe('bg-blue-100 text-blue-800');
    // @ts-expect-error intentionally passing unknown
    expect(getRelationshipColor('Unknown')).toBe('bg-gray-100 text-gray-800');

    expect(getRelationshipIcon('Interested')).toBe('👀');
    expect(getRelationshipIcon('Sold')).toBe('✅');
    expect(getRelationshipIcon('Owned')).toBe('🏠');
    expect(getRelationshipIcon('Booked')).toBe('📅');
    // @ts-expect-error intentionally passing unknown
    expect(getRelationshipIcon('Unknown')).toBe('❓');
  });
});
