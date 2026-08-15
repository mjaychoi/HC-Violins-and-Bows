import type { Client, ClientInstrument, Instrument } from '@/types';
import {
  buildConnectionSearchText,
  connectionMatchesSearch,
  indexById,
  patchConnectionsRelatedClient,
  patchConnectionsRelatedInstrument,
  resolveConnectionClient,
  resolveConnectionInstrument,
  resolveConnectionView,
  resolveConnectionsView,
} from '../resolveConnectionRelatedEntities';

function client(overrides: Partial<Client> & Pick<Client, 'id'>): Client {
  return {
    last_name: null,
    first_name: null,
    contact_number: null,
    email: null,
    tags: [],
    interest: null,
    note: null,
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function instrument(
  overrides: Partial<Instrument> & Pick<Instrument, 'id'>
): Instrument {
  return {
    status: 'Available',
    maker: null,
    type: null,
    subtype: null,
    year: null,
    certificate: null,
    size: null,
    weight: null,
    price: null,
    ownership: null,
    note: null,
    serial_number: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function connection(
  overrides: Partial<ClientInstrument> & Pick<ClientInstrument, 'id'>
): ClientInstrument {
  return {
    client_id: 'client-a',
    instrument_id: 'instrument-a',
    relationship_type: 'Interested',
    notes: 'keep-me',
    display_order: 3,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveConnectionRelatedEntities', () => {
  describe('client identity (C1–C6)', () => {
    const staleEmbed = client({
      id: 'client-a',
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice.smith@example.com',
    });
    const canonical = client({
      id: 'client-a',
      first_name: 'Alice',
      last_name: 'Jones',
      email: 'alice.jones@example.com',
      tags: ['Owner'],
    });
    const row = connection({
      id: 'c1',
      client: staleEmbed,
      instrument: instrument({ id: 'instrument-a', maker: 'Strad' }),
    });

    it('C1: canonical Client name wins over a stale embed', () => {
      const resolved = resolveConnectionClient(row, indexById([canonical]));
      expect(resolved?.last_name).toBe('Jones');
      expect(resolved?.first_name).toBe('Alice');
    });

    it('C2: search matches the canonical Client name', () => {
      const resolved = resolveConnectionView(
        row,
        indexById([canonical]),
        new Map()
      );
      expect(connectionMatchesSearch(resolved, 'Jones')).toBe(true);
    });

    it('C3: stale embedded Client name does not match once canonical is available', () => {
      const resolved = resolveConnectionView(
        row,
        indexById([canonical]),
        new Map()
      );
      expect(connectionMatchesSearch(resolved, 'Smith')).toBe(false);
      expect(buildConnectionSearchText(resolved)).not.toContain('smith');
    });

    it('C4: falls back to the embedded Client when canonical is unavailable', () => {
      expect(resolveConnectionClient(row, new Map())).toEqual(staleEmbed);
      expect(connectionMatchesSearch(row, 'Smith')).toBe(true);
    });

    it('C5: every Connection sharing the Client resolves the new identity', () => {
      const other = connection({
        id: 'c2',
        client_id: 'client-a',
        instrument_id: 'instrument-b',
        relationship_type: 'Owned',
        notes: 'other',
        client: staleEmbed,
      });
      const resolved = resolveConnectionsView([row, other], [canonical], []);
      expect(resolved.map(item => item.client?.last_name)).toEqual([
        'Jones',
        'Jones',
      ]);
    });

    it('C6: resolving Client identity does not change relationship fields', () => {
      const resolved = resolveConnectionView(
        row,
        indexById([canonical]),
        new Map()
      );
      expect(resolved.id).toBe('c1');
      expect(resolved.client_id).toBe('client-a');
      expect(resolved.instrument_id).toBe('instrument-a');
      expect(resolved.relationship_type).toBe('Interested');
      expect(resolved.notes).toBe('keep-me');
      expect(resolved.display_order).toBe(3);
    });

    it('never matches canonical Clients by name', () => {
      const sameNameDifferentId = client({
        id: 'client-other',
        first_name: 'Alice',
        last_name: 'Jones',
      });
      expect(
        resolveConnectionClient(row, indexById([sameNameDifferentId]))
      ).toEqual(staleEmbed);
    });
  });

  describe('instrument identity (I1–I6)', () => {
    const staleEmbed = instrument({
      id: 'instrument-a',
      maker: 'Old Maker',
      type: 'Violin',
      serial_number: 'OLD123',
      year: 1900,
      price: 1000,
    });
    const canonical = instrument({
      id: 'instrument-a',
      maker: 'New Maker',
      type: 'Viola',
      serial_number: 'NEW456',
      year: 1921,
      price: 2500,
    });
    const row = connection({
      id: 'c1',
      client: client({ id: 'client-a', first_name: 'Pat' }),
      instrument: staleEmbed,
    });

    it('I1: canonical maker wins over a stale embed', () => {
      expect(
        resolveConnectionInstrument(row, indexById([canonical]))?.maker
      ).toBe('New Maker');
    });

    it('I2: current serial is present on the resolved instrument', () => {
      expect(
        resolveConnectionInstrument(row, indexById([canonical]))?.serial_number
      ).toBe('NEW456');
    });

    it('I2: current maker/type/year/price are searchable where Connections search is supported', () => {
      const resolved = resolveConnectionView(
        row,
        new Map(),
        indexById([canonical])
      );
      expect(connectionMatchesSearch(resolved, 'New Maker')).toBe(true);
      expect(connectionMatchesSearch(resolved, 'Viola')).toBe(true);
      expect(connectionMatchesSearch(resolved, '1921')).toBe(true);
      expect(connectionMatchesSearch(resolved, '2500')).toBe(true);
    });

    it('I3: stale embedded instrument values do not match once canonical is available', () => {
      const resolved = resolveConnectionView(
        row,
        new Map(),
        indexById([canonical])
      );
      expect(connectionMatchesSearch(resolved, 'Old Maker')).toBe(false);
      expect(connectionMatchesSearch(resolved, 'Violin')).toBe(false);
      expect(connectionMatchesSearch(resolved, 'OLD123')).toBe(false);
    });

    it('I4: falls back to the embedded Instrument when canonical is unavailable', () => {
      expect(resolveConnectionInstrument(row, new Map())).toEqual(staleEmbed);
    });

    it('I5: every Connection sharing the Instrument resolves the new identity', () => {
      const other = connection({
        id: 'c2',
        client_id: 'client-b',
        instrument_id: 'instrument-a',
        relationship_type: 'Booked',
        notes: 'other',
        instrument: staleEmbed,
      });
      const resolved = resolveConnectionsView([row, other], [], [canonical]);
      expect(resolved.map(item => item.instrument?.maker)).toEqual([
        'New Maker',
        'New Maker',
      ]);
    });

    it('I6: resolving Instrument identity does not change relationship fields', () => {
      const resolved = resolveConnectionView(
        row,
        new Map(),
        indexById([canonical])
      );
      expect(resolved.relationship_type).toBe('Interested');
      expect(resolved.notes).toBe('keep-me');
      expect(resolved.display_order).toBe(3);
      expect(resolved.client_id).toBe('client-a');
      expect(resolved.instrument_id).toBe('instrument-a');
    });

    it('never matches canonical Instruments by maker or serial', () => {
      const sameFieldsDifferentId = instrument({
        id: 'instrument-other',
        maker: 'New Maker',
        serial_number: 'NEW456',
      });
      expect(
        resolveConnectionInstrument(row, indexById([sameFieldsDifferentId]))
      ).toEqual(staleEmbed);
    });
  });

  describe('deleted / missing related entity', () => {
    it('keeps a valid Connection row when both canonical and embed are missing', () => {
      const row = connection({ id: 'orphan' });
      const resolved = resolveConnectionView(row, new Map(), new Map());
      expect(resolved).toBe(row);
      expect(resolved.client).toBeUndefined();
      expect(resolved.instrument).toBeUndefined();
    });
  });

  describe('patchConnectionsRelatedClient / Instrument', () => {
    it('updates every matching Connection and leaves unrelated rows and relationship data intact', () => {
      const matchingA = connection({
        id: 'c1',
        client: client({ id: 'client-a', last_name: 'Smith' }),
        notes: 'a',
      });
      const matchingB = connection({
        id: 'c2',
        client: client({ id: 'client-a', last_name: 'Smith' }),
        notes: 'b',
        relationship_type: 'Owned',
      });
      const other = connection({
        id: 'c3',
        client_id: 'client-b',
        client: client({ id: 'client-b', last_name: 'Other' }),
      });

      const patched = patchConnectionsRelatedClient(
        [matchingA, matchingB, other],
        client({ id: 'client-a', last_name: 'Jones' })
      );

      expect(patched[0].client?.last_name).toBe('Jones');
      expect(patched[1].client?.last_name).toBe('Jones');
      expect(patched[2].client?.last_name).toBe('Other');
      expect(patched[0].notes).toBe('a');
      expect(patched[1].relationship_type).toBe('Owned');
    });

    it('returns the same array when no Connection references the entity', () => {
      const rows = [
        connection({
          id: 'c1',
          client_id: 'client-b',
          client: client({ id: 'client-b' }),
        }),
      ];
      expect(
        patchConnectionsRelatedClient(rows, client({ id: 'client-a' }))
      ).toBe(rows);
    });

    it('patches nested instruments for every matching Connection', () => {
      const matching = connection({
        id: 'c1',
        instrument: instrument({ id: 'instrument-a', maker: 'Old' }),
      });
      const other = connection({
        id: 'c2',
        instrument_id: 'instrument-b',
        instrument: instrument({ id: 'instrument-b', maker: 'Keep' }),
      });

      const patched = patchConnectionsRelatedInstrument(
        [matching, other],
        instrument({ id: 'instrument-a', maker: 'New', serial_number: 'S1' })
      );

      expect(patched[0].instrument?.maker).toBe('New');
      expect(patched[0].instrument?.serial_number).toBe('S1');
      expect(patched[1].instrument?.maker).toBe('Keep');
    });
  });
});
