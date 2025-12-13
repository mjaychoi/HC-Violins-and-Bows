import { filterClients, sortClients } from '../clientUtils';
import { Client } from '@/types';
import { FilterState } from '../../types';

const makeClient = (overrides: Partial<Client>): Client => ({
  id: 'id',
  first_name: 'A',
  last_name: 'A',
  contact_number: '1',
  email: 'a@example.com',
  tags: [],
  interest: 'Active',
  note: '',
  client_number: null,
  created_at: '2023-01-01T00:00:00Z',
  ...overrides,
});

describe('clientUtils edge sorting & filtering', () => {
  it('sortClients pushes null values to the end', () => {
    const clients = [
      makeClient({ id: '1', first_name: null as any }),
      makeClient({ id: '2', first_name: 'Bob' }),
      makeClient({ id: '3', first_name: 'Alice' }),
    ];
    const sorted = sortClients(clients, 'first_name', 'asc');
    expect(sorted.map(c => c.id)).toEqual(['3', '2', '1']);
  });

  it('sortClients uses last_name as secondary key for stability', () => {
    const clients = [
      makeClient({ id: '1', first_name: 'Sam', last_name: 'Zulu' }),
      makeClient({ id: '2', first_name: 'Sam', last_name: 'Alpha' }),
    ];
    const sorted = sortClients(clients, 'first_name', 'asc');
    expect(sorted.map(c => c.id)).toEqual(['2', '1']); // Alpha before Zulu
  });

  it('sortClients handles descending order', () => {
    const clients = [
      makeClient({ id: '1', first_name: 'Alice' }),
      makeClient({ id: '2', first_name: 'Bob' }),
    ];
    const sorted = sortClients(clients, 'first_name', 'desc');
    expect(sorted.map(c => c.id)).toEqual(['2', '1']);
  });

  it('sortClients defaults to first_name when no field provided', () => {
    const clients = [
      makeClient({ id: '1', first_name: 'Charlie' }),
      makeClient({ id: '2', first_name: 'Bravo' }),
    ];
    const sorted = sortClients(clients);
    expect(sorted.map(c => c.id)).toEqual(['2', '1']);
  });

  it('filterClients returns all when search and filters are empty', () => {
    const clients = [makeClient({ id: '1' }), makeClient({ id: '2' })];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    };
    const result = filterClients(clients, '', filters);
    expect(result).toHaveLength(2);
  });

  it('filterClients searches in note field (case-insensitive)', () => {
    const clients = [
      makeClient({ id: '1', note: 'Requires follow-up' }),
      makeClient({ id: '2', note: 'No action' }),
    ];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    };
    const result = filterClients(clients, 'FOLLOW', filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filterClients handles clients with undefined tags gracefully', () => {
    const clients = [
      makeClient({ id: '1', tags: undefined as any }),
      makeClient({ id: '2', tags: ['Owner'] }),
    ];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: ['Owner'],
      interest: [],
      hasInstruments: [],
    };
    const result = filterClients(clients, '', filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filterClients is case-insensitive for searchTerm across fields', () => {
    const clients = [
      makeClient({ id: '1', interest: 'Active' }),
      makeClient({ id: '2', interest: 'Passive' }),
    ];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    };
    const result = filterClients(clients, 'passive', filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filterClients ignores hasInstruments when clientsWithInstruments is undefined', () => {
    const clients = [makeClient({ id: '1' }), makeClient({ id: '2' })];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: ['Has Instruments'],
    };
    const result = filterClients(clients, '', filters, {
      clientsWithInstruments: undefined,
    });
    // No Set provided -> empty set -> all clients filtered out by hasInstruments
    expect(result).toHaveLength(0);
  });

  it('filterClients combines searchTerm and hasInstruments filter', () => {
    const clients = [
      makeClient({ id: '1', first_name: 'Alice' }),
      makeClient({ id: '2', first_name: 'Bob' }),
    ];
    const filters: FilterState = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: ['Has Instruments'],
    };
    const result = filterClients(clients, 'bob', filters, {
      clientsWithInstruments: new Set(['2']),
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
