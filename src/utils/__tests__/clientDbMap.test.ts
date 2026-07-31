import {
  createClientInputToDbRow,
  mapClientsTableRowToClient,
  mergePartialClientIntoDbPatch,
} from '@/utils/clientDbMap';

describe('clientDbMap', () => {
  describe('mapClientsTableRowToClient', () => {
    it('prefers stored first_name and last_name over legacy name split', () => {
      const client = mapClientsTableRowToClient({
        id: 'client-1',
        name: 'Wrong Name',
        first_name: null,
        last_name: 'Kim',
      });

      expect(client.first_name).toBeNull();
      expect(client.last_name).toBe('Kim');
    });

    it('falls back to legacy name split when parts are missing', () => {
      const client = mapClientsTableRowToClient({
        id: 'client-2',
        name: 'John Doe',
      });

      expect(client.first_name).toBe('John');
      expect(client.last_name).toBe('Doe');
    });

    it('maps updated_at from the database row', () => {
      const client = mapClientsTableRowToClient({
        id: 'client-3',
        name: 'Ada Lovelace',
        updated_at: '2024-06-01T12:00:00Z',
      });

      expect(client.updated_at).toBe('2024-06-01T12:00:00Z');
    });
  });

  describe('createClientInputToDbRow', () => {
    it('persists last-name-only clients with separate fields', () => {
      const row = createClientInputToDbRow({
        first_name: null,
        last_name: 'Kim',
        contact_number: null,
        email: null,
        client_number: null,
        tags: [],
        interest: null,
        note: null,
      });

      expect(row.first_name).toBeNull();
      expect(row.last_name).toBe('Kim');
      expect(row.name).toBe('Kim');
    });

    it('persists first-name-only clients with separate fields', () => {
      const row = createClientInputToDbRow({
        first_name: 'Ada',
        last_name: null,
        contact_number: null,
        email: null,
        client_number: null,
        tags: [],
        interest: null,
        note: null,
      });

      expect(row.first_name).toBe('Ada');
      expect(row.last_name).toBeNull();
      expect(row.name).toBe('Ada');
    });
  });

  describe('mergePartialClientIntoDbPatch', () => {
    it('updates only last_name while preserving first_name', () => {
      const patch = mergePartialClientIntoDbPatch(
        { first_name: 'Ada', last_name: null, name: 'Ada' },
        { last_name: 'Lovelace' }
      );

      expect(patch.first_name).toBe('Ada');
      expect(patch.last_name).toBe('Lovelace');
      expect(patch.name).toBe('Ada Lovelace');
    });

    it('clears first_name while keeping last_name', () => {
      const patch = mergePartialClientIntoDbPatch(
        { first_name: 'Ada', last_name: 'Lovelace', name: 'Ada Lovelace' },
        { first_name: '' }
      );

      expect(patch.first_name).toBeNull();
      expect(patch.last_name).toBe('Lovelace');
      expect(patch.name).toBe('Lovelace');
    });
  });
});
