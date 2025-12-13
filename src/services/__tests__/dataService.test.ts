import {
  applyQuery,
  invalidateCache,
  getCacheTimestamp,
  fetchClients,
  fetchInstruments,
} from '../dataService';
import { Client, Instrument } from '@/types';

describe('dataService', () => {
  const sampleClients: Client[] = [
    {
      id: 'c1',
      first_name: 'Alice',
      last_name: 'Kim',
      email: 'alice@test.com',
      created_at: '2024-01-01',
      client_number: '1',
      tags: [],
      interest: null,
      note: null,
      contact_number: null,
    },
    {
      id: 'c2',
      first_name: 'Bob',
      last_name: 'Lee',
      email: 'bob@test.com',
      created_at: '2024-01-02',
      client_number: '2',
      tags: [],
      interest: null,
      note: null,
      contact_number: null,
    },
  ];

  const sampleInstruments: Instrument[] = [
    {
      id: 'i1',
      maker: 'Strad',
      type: 'Violin',
      subtype: 'Classic',
      serial_number: 'S1',
      status: 'Available',
      certificate: false,
      created_at: '2024-01-01',
      note: null,
      ownership: null,
      price: null,
      size: null,
      weight: null,
      year: null,
    },
    {
      id: 'i2',
      maker: 'Guarneri',
      type: 'Cello',
      subtype: null,
      serial_number: 'S2',
      status: 'Available',
      certificate: false,
      created_at: '2024-01-02',
      note: null,
      ownership: null,
      price: null,
      size: null,
      weight: null,
      year: null,
    },
  ];

  beforeEach(() => {
    invalidateCache('clients');
    invalidateCache('instruments');
  });

  it('applies search/filter/sort via applyQuery', () => {
    const result = applyQuery(
      sampleClients,
      {
        searchTerm: 'alice',
        sortBy: 'created_at',
        sortDirection: 'desc',
        filter: { client_number: '1' },
      },
      ['first_name', 'last_name', 'email']
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('updates cache timestamp on fetchClients', async () => {
    const fetcher = jest.fn().mockResolvedValue(sampleClients);
    const clients = await fetchClients(fetcher, { searchTerm: 'bob' });
    expect(clients).toHaveLength(1);
    expect(getCacheTimestamp('clients')).toBeDefined();
  });

  it('updates cache timestamp on fetchInstruments', async () => {
    const fetcher = jest.fn().mockResolvedValue(sampleInstruments);
    const instruments = await fetchInstruments(fetcher, {
      searchTerm: 'strad',
    });
    expect(instruments).toHaveLength(1);
    expect(getCacheTimestamp('instruments')).toBeDefined();
  });
});
