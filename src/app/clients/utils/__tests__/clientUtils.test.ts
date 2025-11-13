// src/app/clients/utils/__tests__/clientUtils.test.ts
import {
  formatClientName,
  formatClientContact,
  getClientInitials,
  isClientComplete,
  filterClients,
  sortClients,
} from '../clientUtils';
import { Client } from '@/types';
import { FilterState } from '../../types';

describe('Client Utils', () => {
  const mockClient: Client = {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Owner', 'Musician'],
    interest: 'Active',
    note: 'Test note',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
  };

  describe('formatClientName', () => {
    it('should format full name correctly', () => {
      const result = formatClientName(mockClient);
      expect(result).toBe('John Doe');
    });

    it('should handle missing first name', () => {
      const client = { ...mockClient, first_name: '' };
      const result = formatClientName(client);
      expect(result).toBe('Doe');
    });

    it('should handle missing last name', () => {
      const client = { ...mockClient, last_name: '' };
      const result = formatClientName(client);
      expect(result).toBe('John');
    });

    it('should handle missing both names', () => {
      const client = { ...mockClient, first_name: '', last_name: '' };
      const result = formatClientName(client);
      expect(result).toBe('Unknown Client');
    });
  });

  describe('formatClientContact', () => {
    it('should format contact with phone number only', () => {
      const result = formatClientContact(mockClient);
      expect(result).toBe('123-456-7890');
    });

    it('should handle missing phone', () => {
      const client = { ...mockClient, contact_number: '' };
      const result = formatClientContact(client);
      expect(result).toBe('No contact info');
    });

    it('should handle missing phone with email present', () => {
      const client = {
        ...mockClient,
        contact_number: '',
        email: 'john@example.com',
      };
      const result = formatClientContact(client);
      expect(result).toBe('No contact info');
    });

    it('should handle missing both', () => {
      const client = { ...mockClient, email: '', contact_number: '' };
      const result = formatClientContact(client);
      expect(result).toBe('No contact info');
    });
  });

  describe('getClientInitials', () => {
    it('should return initials for full name', () => {
      const result = getClientInitials(mockClient);
      expect(result).toBe('JD');
    });

    it('should handle single name', () => {
      const client = { ...mockClient, first_name: '' };
      const result = getClientInitials(client);
      expect(result).toBe('D');
    });

    it('should handle no names', () => {
      const client = { ...mockClient, first_name: '', last_name: '' };
      const result = getClientInitials(client);
      expect(result).toBe('U');
    });
  });

  describe('isClientComplete', () => {
    it('should return true for complete client', () => {
      const result = isClientComplete(mockClient);
      expect(result).toBe(true);
    });

    it('should return false for incomplete client', () => {
      const client = { ...mockClient, first_name: '', last_name: '' };
      const result = isClientComplete(client);
      expect(result).toBe(false);
    });
  });

  describe('filterClients', () => {
    const clients: Client[] = [
      {
        ...mockClient,
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        tags: ['Owner'],
      },
      {
        ...mockClient,
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
        tags: ['Musician'],
      },
      {
        ...mockClient,
        id: '3',
        first_name: 'Bob',
        last_name: 'Johnson',
        tags: ['Dealer'],
      },
    ];

    it('should filter by search term', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, 'John', filters);
      expect(result).toHaveLength(3); // John, Jane, Bob all contain 'John'
      expect(result[0].first_name).toBe('John');
      expect(result[1].first_name).toBe('Jane');
      expect(result[2].first_name).toBe('Bob');
    });

    it('should filter by tags', () => {
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
      expect(result[0].first_name).toBe('John');
    });

    it('should filter by multiple criteria', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Owner', 'Musician'],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, 'John', filters);
      expect(result).toHaveLength(2); // John and Jane both contain 'John' and match tags
      expect(result[0].first_name).toBe('John');
      expect(result[1].first_name).toBe('Jane');
    });
  });

  describe('sortClients', () => {
    const clients: Client[] = [
      { ...mockClient, id: '1', first_name: 'Charlie', last_name: 'Brown' },
      { ...mockClient, id: '2', first_name: 'Alice', last_name: 'Smith' },
      { ...mockClient, id: '3', first_name: 'Bob', last_name: 'Johnson' },
    ];

    it('should sort by first name ascending', () => {
      const result = sortClients(clients, 'first_name', 'asc');
      expect(result[0].first_name).toBe('Alice');
      expect(result[1].first_name).toBe('Bob');
      expect(result[2].first_name).toBe('Charlie');
    });

    it('should sort by last name descending', () => {
      const result = sortClients(clients, 'last_name', 'desc');
      expect(result[0].last_name).toBe('Smith');
      expect(result[1].last_name).toBe('Johnson');
      expect(result[2].last_name).toBe('Brown');
    });

    it('should handle default sorting', () => {
      const result = sortClients(clients, 'first_name', 'asc');

      expect(result).not.toBe(clients);

      const names = result.map(c => (c.first_name ?? '').toLowerCase());
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });
});
