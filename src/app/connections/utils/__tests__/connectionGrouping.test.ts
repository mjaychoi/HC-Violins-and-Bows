import {
  groupConnectionsByType,
  getRelationshipTypeCounts,
  sortConnectionsForAllTab,
} from '../connectionGrouping';
import { ClientInstrument } from '@/types';

const makeConnection = (
  id: string,
  relationship_type: ClientInstrument['relationship_type']
): ClientInstrument => ({
  id,
  relationship_type,
  client_id: `client-${id}`,
  instrument_id: `inst-${id}`,
  notes: null,
  created_at: '2024-01-01',
});

describe('connectionGrouping utilities', () => {
  const connections: ClientInstrument[] = [
    makeConnection('1', 'Interested'),
    makeConnection('2', 'Sold'),
    makeConnection('3', 'Interested'),
    makeConnection('4', 'Booked'),
  ];

  it('groups connections by relationship type', () => {
    const grouped = groupConnectionsByType(connections);

    expect(Object.keys(grouped)).toEqual(['Interested', 'Sold', 'Booked']);
    expect(grouped.Interested).toHaveLength(2);
    expect(grouped.Sold).toHaveLength(1);
    expect(grouped.Booked?.[0].id).toBe('4');
  });

  it('returns relationship type counts from grouped connections in fixed order', () => {
    const grouped = groupConnectionsByType(connections);
    const counts = getRelationshipTypeCounts(grouped);

    // Should be in fixed order: Interested → Booked → Sold → Owned
    expect(counts).toEqual([
      { type: 'Interested', count: 2 },
      { type: 'Booked', count: 1 },
      { type: 'Sold', count: 1 },
    ]);
  });

  it('sorts All-tab connections by the Client/Instrument already on the row', () => {
    const zebra: ClientInstrument = {
      ...makeConnection('z', 'Interested'),
      client: {
        last_name: 'Zebra',
        first_name: 'A',
      } as ClientInstrument['client'],
      instrument: {
        maker: 'Old',
        type: 'Violin',
      } as ClientInstrument['instrument'],
    };
    const alpha: ClientInstrument = {
      ...makeConnection('a', 'Interested'),
      client: {
        last_name: 'Alpha',
        first_name: 'B',
      } as ClientInstrument['client'],
      instrument: {
        maker: 'New',
        type: 'Viola',
      } as ClientInstrument['instrument'],
    };

    expect(sortConnectionsForAllTab([zebra, alpha]).map(row => row.id)).toEqual(
      ['a', 'z']
    );
  });
});
