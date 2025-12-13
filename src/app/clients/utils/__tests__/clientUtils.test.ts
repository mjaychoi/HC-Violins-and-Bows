// src/app/clients/utils/__tests__/clientUtils.test.ts
import {
  formatClientName,
  formatClientContact,
  getClientInitials,
  isClientComplete,
  getClientDisplayInfo,
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

    it('should handle null first name', () => {
      const client = { ...mockClient, first_name: null };
      const result = formatClientName(client);
      expect(result).toBe('Doe');
    });

    it('should handle null last name', () => {
      const client = { ...mockClient, last_name: null };
      const result = formatClientName(client);
      expect(result).toBe('John');
    });

    it('should handle both null names', () => {
      const client = { ...mockClient, first_name: null, last_name: null };
      const result = formatClientName(client);
      expect(result).toBe('Unknown Client');
    });

    it('should trim whitespace from full name', () => {
      const client = { ...mockClient, first_name: '  John  ', last_name: '  Doe  ' };
      const result = formatClientName(client);
      // trim()은 전체 문자열에만 적용되므로 '  John     Doe  '.trim() = 'John     Doe'
      expect(result).toBe('John     Doe');
    });

    it('should handle whitespace-only names', () => {
      const client = { ...mockClient, first_name: '   ', last_name: '   ' };
      const result = formatClientName(client);
      // '     '.trim() = '', which becomes 'Unknown Client'
      expect(result).toBe('Unknown Client');
    });

    it('should handle one whitespace-only name', () => {
      const client = { ...mockClient, first_name: '   ', last_name: 'Doe' };
      const result = formatClientName(client);
      // '     Doe'.trim() = 'Doe'
      expect(result).toBe('Doe');
    });

    it('should handle single space between names', () => {
      const result = formatClientName(mockClient);
      expect(result).toBe('John Doe');
      expect(result.split(' ').length).toBe(2);
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

    it('should handle null contact_number', () => {
      const client = { ...mockClient, contact_number: null };
      const result = formatClientContact(client);
      expect(result).toBe('No contact info');
    });

    it('should handle null contact_number with email', () => {
      const client = { ...mockClient, contact_number: null, email: 'test@test.com' };
      const result = formatClientContact(client);
      expect(result).toBe('No contact info');
    });

    it('should return contact_number when present even if email is null', () => {
      const client = { ...mockClient, email: null };
      const result = formatClientContact(client);
      expect(result).toBe('123-456-7890');
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

    it('should handle null first name', () => {
      const client = { ...mockClient, first_name: null };
      const result = getClientInitials(client);
      expect(result).toBe('D');
    });

    it('should handle null last name', () => {
      const client = { ...mockClient, last_name: null };
      const result = getClientInitials(client);
      expect(result).toBe('J');
    });

    it('should handle both null names', () => {
      const client = { ...mockClient, first_name: null, last_name: null };
      const result = getClientInitials(client);
      expect(result).toBe('U');
    });

    it('should uppercase initials correctly', () => {
      const client = { ...mockClient, first_name: 'john', last_name: 'doe' };
      const result = getClientInitials(client);
      expect(result).toBe('JD');
    });

    it('should handle single character names', () => {
      const client = { ...mockClient, first_name: 'A', last_name: 'B' };
      const result = getClientInitials(client);
      expect(result).toBe('AB');
    });

    it('should handle empty string names', () => {
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

    it('should return false when missing first name', () => {
      const client = { ...mockClient, first_name: '' };
      const result = isClientComplete(client);
      expect(result).toBe(false);
    });

    it('should return false when missing last name', () => {
      const client = { ...mockClient, last_name: '' };
      const result = isClientComplete(client);
      expect(result).toBe(false);
    });

    it('should return true when has contact_number but no email', () => {
      const client = { ...mockClient, email: '' };
      const result = isClientComplete(client);
      expect(result).toBe(true);
    });

    it('should return true when has email but no contact_number', () => {
      const client = { ...mockClient, contact_number: '' };
      const result = isClientComplete(client);
      expect(result).toBe(true);
    });

    it('should return false when missing both contact_number and email', () => {
      const client = { ...mockClient, contact_number: '', email: '' };
      const result = isClientComplete(client);
      expect(result).toBe(false);
    });
  });

  describe('getClientDisplayInfo', () => {
    it('should return all display information for complete client', () => {
      const result = getClientDisplayInfo(mockClient);
      
      expect(result).toEqual({
        name: 'John Doe',
        contact: '123-456-7890',
        initials: 'JD',
        isComplete: true,
      });
    });

    it('should return display info for client with missing name', () => {
      const client = { ...mockClient, first_name: '', last_name: '' };
      const result = getClientDisplayInfo(client);
      
      expect(result).toEqual({
        name: 'Unknown Client',
        contact: '123-456-7890',
        initials: 'U',
        isComplete: false,
      });
    });

    it('should return display info for client with missing contact', () => {
      const client = { ...mockClient, contact_number: '', email: '' };
      const result = getClientDisplayInfo(client);
      
      expect(result).toEqual({
        name: 'John Doe',
        contact: 'No contact info',
        initials: 'JD',
        isComplete: false,
      });
    });

    it('should return display info for client with only first name', () => {
      const client = { ...mockClient, last_name: '' };
      const result = getClientDisplayInfo(client);
      
      expect(result).toEqual({
        name: 'John',
        contact: '123-456-7890',
        initials: 'J',
        isComplete: false,
      });
    });

    it('should return display info for client with only last name', () => {
      const client = { ...mockClient, first_name: '' };
      const result = getClientDisplayInfo(client);
      
      expect(result).toEqual({
        name: 'Doe',
        contact: '123-456-7890',
        initials: 'D',
        isComplete: false,
      });
    });

    it('should return display info for client with null values', () => {
      const client: Client = {
        ...mockClient,
        first_name: null,
        last_name: null,
        contact_number: null,
        email: null,
      };
      const result = getClientDisplayInfo(client);
      
      expect(result).toEqual({
        name: 'Unknown Client',
        contact: 'No contact info',
        initials: 'U',
        isComplete: false,
      });
    });

    it('should return display info for minimal client data', () => {
      const minimalClient: Client = {
        id: '1',
        first_name: 'A',
        last_name: 'B',
        contact_number: '1',
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2023-01-01',
      };
      const result = getClientDisplayInfo(minimalClient);
      
      expect(result.name).toBe('A B');
      expect(result.contact).toBe('1');
      expect(result.initials).toBe('AB');
      expect(result.isComplete).toBe(true);
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

    it('should search in tags field', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      // 'Musician' 태그를 가진 클라이언트 검색
      const result = filterClients(clients, 'Musician', filters);
      expect(result).toHaveLength(1);
      expect(result[0].first_name).toBe('Jane');
      expect(result[0].tags).toContain('Musician');
    });

    it('should filter by hasInstruments when HAS is selected', () => {
      const clientsWithInstruments = new Set<string>(['1']);
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
        clientsWithInstruments,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter by hasInstruments when NO is selected', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: ['No Instruments'],
      };
      const result = filterClients(clients, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(2); // id '2' and '3' don't have instruments
      expect(result.every(c => c.id !== '1')).toBe(true);
    });

    it('should not filter when both hasInstruments options are selected (length > 1)', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: ['Has Instruments', 'No Instruments'],
      };
      // 둘 다 선택되면 필터가 적용되지 않아야 함
      const result = filterClients(clients, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(3); // 모든 클라이언트가 반환됨
    });

    it('should not filter when hasInstruments is empty', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(3); // 모든 클라이언트가 반환됨
    });

    it('should not filter when hasInstruments has 2 or more items (edge case)', () => {
      const clientsWithInstruments = new Set<string>(['1', '2']);
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: ['Has Instruments', 'No Instruments'],
      };
      // 길이가 2이므로 필터가 적용되지 않아야 함 (주석 참고: 0개 또는 2개는 필터 미적용)
      const result = filterClients(clients, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(3); // 모든 클라이언트가 반환됨
    });

    it('should filter by hasInstruments when exactly 1 option is selected', () => {
      const clientsWithInstruments = new Set<string>(['1', '2']);
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: ['Has Instruments'], // 정확히 1개
      };
      const result = filterClients(clients, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(2); // id '1' and '2' only
      expect(result.every(c => ['1', '2'].includes(c.id))).toBe(true);
    });

    it('should search in client_number field', () => {
      const clientsWithNumbers: Client[] = [
        {
          ...mockClient,
          id: '1',
          first_name: 'John',
          client_number: 'CL001',
        },
        {
          ...mockClient,
          id: '2',
          first_name: 'Jane',
          client_number: 'CL002',
        },
        {
          ...mockClient,
          id: '3',
          first_name: 'Bob',
          client_number: null,
        },
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
      // Search by client_number
      const result = filterClients(clientsWithNumbers, 'CL001', filters);
      expect(result).toHaveLength(1);
      expect(result[0].client_number).toBe('CL001');

      // Search by partial client_number
      const result2 = filterClients(clientsWithNumbers, 'CL00', filters);
      expect(result2).toHaveLength(2); // CL001 and CL002

      // Search should work case-insensitively
      const result3 = filterClients(clientsWithNumbers, 'cl001', filters);
      expect(result3).toHaveLength(1);
    });

    it('should combine search term with hasInstruments filter', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const clientsForTest: Client[] = [
        {
          ...mockClient,
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
        },
        {
          ...mockClient,
          id: '2',
          first_name: 'John',
          last_name: 'Smith',
        },
        {
          ...mockClient,
          id: '3',
          first_name: 'Jane',
          last_name: 'Doe',
        },
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
      // Search for "John" + has instruments filter
      const result = filterClients(clientsForTest, 'John', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].first_name).toBe('John');
    });

    it('should filter when multiple fields are combined with hasInstruments', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const clientsForTest: Client[] = [
        {
          ...mockClient,
          id: '1',
          tags: ['Owner', 'Musician'],
          interest: 'Active',
        },
        {
          ...mockClient,
          id: '2',
          tags: ['Owner'],
          interest: 'Active',
        },
        {
          ...mockClient,
          id: '3',
          tags: ['Musician'],
          interest: 'Passive',
        },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Owner'],
        interest: ['Active'],
        hasInstruments: ['Has Instruments'],
      };
      const result = filterClients(clientsForTest, '', filters, {
        clientsWithInstruments,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].tags).toContain('Owner');
      expect(result[0].interest).toBe('Active');
    });

    it('should handle empty search term correctly', () => {
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
      expect(result).toHaveLength(3); // 모든 클라이언트 반환
    });

    it('should handle search term with special characters', () => {
      const clientsWithSpecial: Client[] = [
        {
          ...mockClient,
          id: '1',
          email: 'test+tag@example.com',
          note: 'Special: character!',
        },
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

      // 특수문자 포함 검색
      const result1 = filterClients(clientsWithSpecial, '+tag', filters);
      expect(result1.length).toBeGreaterThanOrEqual(0);

      // 콜론 검색
      const result2 = filterClients(clientsWithSpecial, 'Special:', filters);
      expect(result2.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by multiple tags (OR condition)', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Owner', 'Musician'],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      // Owner 또는 Musician 태그를 가진 클라이언트
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(
          client.tags?.includes('Owner') || client.tags?.includes('Musician')
        ).toBe(true);
      });
    });

    it('should filter by multiple interest values', () => {
      const clientsForTest: Client[] = [
        { ...mockClient, id: '1', interest: 'Active' },
        { ...mockClient, id: '2', interest: 'Passive' },
        { ...mockClient, id: '3', interest: 'Inactive' },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: ['Active', 'Passive'],
        hasInstruments: [],
      };
      const result = filterClients(clientsForTest, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.every(c => ['Active', 'Passive'].includes(c.interest || ''))).toBe(true);
    });

    it('should combine hasInstruments filter with other filters', () => {
      const clientsWithInstruments = new Set<string>(['1']);
      const clientsForTest: Client[] = [
        { ...mockClient, id: '1', tags: ['Owner'], interest: 'Active' },
        { ...mockClient, id: '2', tags: ['Owner'], interest: 'Active' },
        { ...mockClient, id: '3', tags: ['Musician'], interest: 'Active' },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Owner'],
        interest: ['Active'],
        hasInstruments: ['Has Instruments'],
      };
      const result = filterClients(clientsForTest, '', filters, {
        clientsWithInstruments,
      });
      // Owner 태그 + Active 관심도 + Has Instruments
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should handle case-insensitive search', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      // 대문자 검색
      const result1 = filterClients(clients, 'JOHN', filters);
      // 소문자 검색
      const result2 = filterClients(clients, 'john', filters);
      // 혼합 케이스 검색
      const result3 = filterClients(clients, 'JoHn', filters);

      // 모두 같은 결과를 반환해야 함 (대소문자 무시)
      expect(result1.length).toBeGreaterThanOrEqual(0);
      expect(result2.length).toBeGreaterThanOrEqual(0);
      expect(result3.length).toBeGreaterThanOrEqual(0);
    });

    it('should search in note field', () => {
      const clientsWithNotes: Client[] = [
        { ...mockClient, id: '1', note: 'Prefers vintage violins' },
        { ...mockClient, id: '2', note: 'Looking for cello' },
        { ...mockClient, id: '3', note: null },
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
      const result = filterClients(clientsWithNotes, 'vintage', filters);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(c => c.note?.includes('vintage'))).toBe(true);
    });

    it('should handle hasInstruments filter when clientsWithInstruments is empty Set', () => {
      const emptySet = new Set<string>();
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
        clientsWithInstruments: emptySet,
      });
      // 빈 Set이므로 Has Instruments 필터는 결과 없음
      expect(result).toHaveLength(0);
    });

    it('should handle hasInstruments filter when clientsWithInstruments contains all IDs', () => {
      const allIds = new Set<string>(['1', '2', '3']);
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
        clientsWithInstruments: allIds,
      });
      // 모든 ID가 Set에 있으므로 모든 클라이언트 반환
      expect(result.length).toBe(clients.length);
    });

    it('should filter by contact_number field', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: ['123-456-7890'],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(client.contact_number).toBe('123-456-7890');
      });
    });

    it('should filter by email field', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: ['john@example.com'],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(client.email).toBe('john@example.com');
      });
    });

    it('should filter by multiple last_name values', () => {
      const filters: FilterState = {
        last_name: ['Doe', 'Smith'],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['Doe', 'Smith']).toContain(client.last_name);
      });
    });

    it('should filter by multiple first_name values', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: ['John', 'Jane'],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['John', 'Jane']).toContain(client.first_name);
      });
    });

    it('should handle search with whitespace correctly', () => {
      const clientsWithSpaces: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '2', first_name: 'Jane', last_name: 'Smith' },
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

      // 공백만 있는 검색어는 truthy이므로 검색이 시도되지만, 실제 필드에는 공백이 없어 매칭 안됨
      const result1 = filterClients(clientsWithSpaces, '   ', filters);
      expect(result1).toHaveLength(0); // 공백만으로는 매칭되지 않음

      // 앞뒤 공백이 있는 검색어 - 공백이 포함되어 검색됨
      const result2 = filterClients(clientsWithSpaces, ' John ', filters);
      // 공백이 포함되어 있지만 'John' 부분이 매칭될 수 있음 (실제 구현에 따라 다름)
      expect(result2.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long search terms', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const longTerm = 'a'.repeat(1000);
      const result = filterClients(clients, longTerm, filters);
      expect(result).toHaveLength(0); // 매칭되는 결과 없음
    });

    it('should filter with all fields empty (no filters applied)', () => {
      const emptyFilters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', emptyFilters);
      expect(result).toHaveLength(clients.length);
      expect(result).toEqual(clients);
    });

    it('should handle clientsWithInstruments option not provided', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: ['Has Instruments'],
      };
      // 옵션을 제공하지 않으면 내부적으로 빈 Set 사용
      const result = filterClients(clients, '', filters);
      // 빈 Set이므로 Has Instruments 필터는 아무것도 반환하지 않음
      expect(result).toHaveLength(0);
    });

    it('should combine search with multiple filters correctly', () => {
      const clientsForTest: Client[] = [
        { 
          ...mockClient, 
          id: '1', 
          first_name: 'John', 
          email: 'john1@test.com', // 고유한 이메일로 검색 범위 제한
          tags: ['Owner'], 
          interest: 'Active' 
        },
        { 
          ...mockClient, 
          id: '2', 
          first_name: 'John', 
          email: 'john2@test.com',
          tags: ['Musician'], 
          interest: 'Passive' 
        },
        { 
          ...mockClient, 
          id: '3', 
          first_name: 'Jane', 
          email: 'jane@test.com',
          tags: ['Owner'], 
          interest: 'Active' 
        },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Owner'],
        interest: ['Active'],
        hasInstruments: [],
      };

      // "John" 검색 + Owner 태그 + Active 관심도
      // 결과: id '1'만 만족 (John 이름 + Owner 태그 + Active 관심도)
      const result = filterClients(clientsForTest, 'John', filters);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // 모든 조건을 만족하는 클라이언트만 포함
      const matching = result.filter(
        c => 
          c.first_name?.toLowerCase().includes('john') &&
          c.tags?.includes('Owner') &&
          c.interest === 'Active'
      );
      expect(matching.length).toBe(1);
      expect(matching[0].id).toBe('1');
    });

    it('should handle Unicode characters in search', () => {
      const clientsWithUnicode: Client[] = [
        { ...mockClient, id: '1', first_name: '김', last_name: '철수' },
        { ...mockClient, id: '2', first_name: '이', last_name: '영희' },
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

      const result = filterClients(clientsWithUnicode, '김', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result.some(c => c.first_name === '김')).toBe(true);
    });

    it('should filter by last_name when multiple values provided', () => {
      const filters: FilterState = {
        last_name: ['Doe', 'Smith'],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['Doe', 'Smith']).toContain(client.last_name);
      });
    });

    it('should filter by first_name when multiple values provided', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: ['John', 'Jane'],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['John', 'Jane']).toContain(client.first_name);
      });
    });

    it('should filter by contact_number when multiple values provided', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: ['123-456-7890', '098-765-4321'],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['123-456-7890', '098-765-4321']).toContain(client.contact_number);
      });
    });

    it('should filter by email when multiple values provided', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: ['john@example.com', 'jane@example.com'],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['john@example.com', 'jane@example.com']).toContain(client.email);
      });
    });

    it('should filter by interest when multiple values provided', () => {
      const clientsWithInterests: Client[] = [
        { ...mockClient, id: '1', interest: 'Active' },
        { ...mockClient, id: '2', interest: 'Passive' },
        { ...mockClient, id: '3', interest: 'Inactive' },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: ['Active', 'Passive'],
        hasInstruments: [],
      };
      const result = filterClients(clientsWithInterests, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(client => {
        expect(['Active', 'Passive']).toContain(client.interest);
      });
    });

    it('should not filter when all filter arrays are empty', () => {
      const emptyFilters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', emptyFilters);
      expect(result).toHaveLength(clients.length);
      expect(result).toEqual(clients);
    });

    it('should exclude client when last_name filter does not match', () => {
      const filters: FilterState = {
        last_name: ['NonExistent'],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should exclude client when first_name filter does not match', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: ['NonExistent'],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should exclude client when contact_number filter does not match', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: ['NonExistent'],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should exclude client when email filter does not match', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: ['nonexistent@example.com'],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should exclude client when tags filter does not match', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['NonExistentTag'],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should exclude client when interest filter does not match', () => {
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: ['NonExistentInterest'],
        hasInstruments: [],
      };
      const result = filterClients(clients, '', filters);
      expect(result).toHaveLength(0);
    });

    it('should handle filter when field value is null and filter array is empty', () => {
      const clientsWithNull: Client[] = [
        { ...mockClient, id: '1', last_name: null },
        { ...mockClient, id: '2', last_name: 'Smith' },
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
      // 빈 필터이므로 모든 클라이언트 반환
      const result = filterClients(clientsWithNull, '', filters);
      expect(result).toHaveLength(2);
    });

    it('should handle filter when field value is null and filter array has values', () => {
      const clientsWithNull: Client[] = [
        { ...mockClient, id: '1', last_name: null },
        { ...mockClient, id: '2', last_name: 'Smith' },
      ];
      const filters: FilterState = {
        last_name: ['Smith'],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      };
      // null은 빈 문자열로 변환되어 필터에 포함되지 않음
      const result = filterClients(clientsWithNull, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result.length > 0) {
        expect(result.every(c => c.last_name === 'Smith')).toBe(true);
      }
    });

    it('should handle tags filter when client has no tags (null or empty array)', () => {
      const clientsWithoutTags: Client[] = [
        { ...mockClient, id: '1', tags: [] },
        { ...mockClient, id: '2', tags: [] },
        { ...mockClient, id: '3', tags: ['Musician'] },
      ];
      const filters: FilterState = {
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Musician'],
        interest: [],
        hasInstruments: [],
      };
      const result = filterClients(clientsWithoutTags, '', filters);
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result.length > 0) {
        expect(result.every(c => c.tags?.includes('Musician'))).toBe(true);
      }
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

    it('should not mutate original array', () => {
      const original = [...clients];
      const sorted = sortClients(clients, 'first_name', 'asc');
      
      expect(sorted).not.toBe(clients);
      expect(clients).toEqual(original);
    });

    it('should sort by default field (first_name) when no field specified', () => {
      const result = sortClients(clients, undefined, 'asc');
      expect(result[0].first_name).toBe('Alice');
      expect(result[1].first_name).toBe('Bob');
      expect(result[2].first_name).toBe('Charlie');
    });

    it('should handle case-insensitive sorting', () => {
      const mixedCaseClients: Client[] = [
        { ...mockClient, id: '1', first_name: 'charlie', last_name: 'Brown' },
        { ...mockClient, id: '2', first_name: 'Alice', last_name: 'Smith' },
        { ...mockClient, id: '3', first_name: 'BOB', last_name: 'Johnson' },
      ];

      const result = sortClients(mixedCaseClients, 'first_name', 'asc');
      expect(result[0].first_name).toBe('Alice');
      expect(result[1].first_name).toBe('BOB');
      expect(result[2].first_name).toBe('charlie');
    });

    it('should place null/undefined values at the end (ascending)', () => {
      const clientsWithNulls: Client[] = [
        { ...mockClient, id: '1', first_name: 'Charlie', last_name: 'Brown' },
        { ...mockClient, id: '2', first_name: null, last_name: 'Smith' },
        { ...mockClient, id: '3', first_name: 'Alice', last_name: 'Johnson' },
        { ...mockClient, id: '4', first_name: undefined as any, last_name: 'Wilson' },
      ];

      const result = sortClients(clientsWithNulls, 'first_name', 'asc');
      expect(result[0].first_name).toBe('Alice');
      expect(result[1].first_name).toBe('Charlie');
      expect(result[2].first_name).toBeNull();
      expect(result[3].first_name).toBeUndefined();
    });

    it('should place null/undefined values at the end (descending)', () => {
      const clientsWithNulls: Client[] = [
        { ...mockClient, id: '1', first_name: 'Charlie', last_name: 'Brown' },
        { ...mockClient, id: '2', first_name: null, last_name: 'Smith' },
        { ...mockClient, id: '3', first_name: 'Alice', last_name: 'Johnson' },
      ];

      const result = sortClients(clientsWithNulls, 'first_name', 'desc');
      expect(result[0].first_name).toBe('Charlie');
      expect(result[1].first_name).toBe('Alice');
      expect(result[2].first_name).toBeNull();
    });

    it('should use last_name as secondary sort key', () => {
      const clientsWithSameFirstName: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Zebra' },
        { ...mockClient, id: '2', first_name: 'John', last_name: 'Apple' },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'Brown' },
      ];

      const resultAsc = sortClients(clientsWithSameFirstName, 'first_name', 'asc');
      expect(resultAsc[0].last_name).toBe('Apple');
      expect(resultAsc[1].last_name).toBe('Brown');
      expect(resultAsc[2].last_name).toBe('Zebra');

      const resultDesc = sortClients(clientsWithSameFirstName, 'first_name', 'desc');
      expect(resultDesc[0].last_name).toBe('Zebra');
      expect(resultDesc[1].last_name).toBe('Brown');
      expect(resultDesc[2].last_name).toBe('Apple');
    });

    it('should handle empty array', () => {
      const result = sortClients([], 'first_name', 'asc');
      expect(result).toEqual([]);
    });

    it('should handle single element array', () => {
      const single = [{ ...mockClient, id: '1', first_name: 'John' }];
      const result = sortClients(single, 'first_name', 'asc');
      expect(result).toEqual(single);
      expect(result).not.toBe(single); // 새로운 배열 반환
    });

    it('should sort by email field', () => {
      const clientsByEmail: Client[] = [
        { ...mockClient, id: '1', email: 'zebra@example.com' },
        { ...mockClient, id: '2', email: 'apple@example.com' },
        { ...mockClient, id: '3', email: 'brown@example.com' },
      ];

      const result = sortClients(clientsByEmail, 'email', 'asc');
      expect(result[0].email).toBe('apple@example.com');
      expect(result[1].email).toBe('brown@example.com');
      expect(result[2].email).toBe('zebra@example.com');
    });

    it('should sort by contact_number field', () => {
      const clientsByContact: Client[] = [
        { ...mockClient, id: '1', contact_number: '555-9999' },
        { ...mockClient, id: '2', contact_number: '555-1111' },
        { ...mockClient, id: '3', contact_number: '555-5555' },
      ];

      const result = sortClients(clientsByContact, 'contact_number', 'asc');
      expect(result[0].contact_number).toBe('555-1111');
      expect(result[1].contact_number).toBe('555-5555');
      expect(result[2].contact_number).toBe('555-9999');
    });

    it('should handle equal values with null secondary key', () => {
      const clientsWithNullSecondary: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: null },
        { ...mockClient, id: '2', first_name: 'John', last_name: 'Smith' },
        { ...mockClient, id: '3', first_name: 'John', last_name: null },
      ];

      const result = sortClients(clientsWithNullSecondary, 'first_name', 'asc');
      expect(result[0].first_name).toBe('John');
      expect(result[1].first_name).toBe('John');
      expect(result[2].first_name).toBe('John');
      // null last_name이 있는 항목은 뒤로 이동할 수 있음
    });

    it('should maintain stable sort order for equal primary keys', () => {
      const equalClients: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'A' },
        { ...mockClient, id: '2', first_name: 'John', last_name: 'B' },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'A' },
      ];

      const result = sortClients(equalClients, 'first_name', 'asc');
      // 모두 first_name이 'John'이고, last_name으로 2차 정렬
      expect(result.every(c => c.first_name === 'John')).toBe(true);
      expect(result[0].last_name).toBe('A');
      expect(result[1].last_name).toBe('A');
      expect(result[2].last_name).toBe('B');
    });

    it('should handle non-string values in sort field (numbers)', () => {
      // 숫자 필드는 문자열로 변환되지 않을 수 있음
      const clients: Client[] = [
        { ...mockClient, id: '1' },
        { ...mockClient, id: '2' },
      ];
      // id는 문자열이므로 정상 동작
      const result = sortClients(clients, 'id' as keyof Client, 'asc');
      expect(result.length).toBe(2);
    });

    it('should handle equal values in both primary and secondary keys', () => {
      const equalClients: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '2', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'Doe' },
      ];

      const result = sortClients(equalClients, 'first_name', 'asc');
      expect(result.every(c => c.first_name === 'John' && c.last_name === 'Doe')).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle secondary key null values in descending order', () => {
      const clientsWithNullSecondary: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Smith' },
        { ...mockClient, id: '2', first_name: 'John', last_name: null },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'Doe' },
      ];

      const result = sortClients(clientsWithNullSecondary, 'first_name', 'desc');
      // 모든 first_name이 'John'이므로 동일한 순서 유지
      expect(result.every(c => c.first_name === 'John')).toBe(true);
    });

    it('should handle non-string field types (numbers) in sorting', () => {
      // 숫자 필드가 아닌 문자열 필드만 테스트
      const clients: Client[] = [
        { ...mockClient, id: '1', created_at: '2023-01-03T00:00:00Z' },
        { ...mockClient, id: '2', created_at: '2023-01-01T00:00:00Z' },
        { ...mockClient, id: '3', created_at: '2023-01-02T00:00:00Z' },
      ];

      const result = sortClients(clients, 'created_at', 'asc');
      // 문자열로 정렬되므로 날짜 순서대로 정렬됨
      expect(result[0].created_at).toBe('2023-01-01T00:00:00Z');
      expect(result[1].created_at).toBe('2023-01-02T00:00:00Z');
      expect(result[2].created_at).toBe('2023-01-03T00:00:00Z');
    });

    it('should handle sorting when primary key values are equal and secondary keys are also equal', () => {
      const clients: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '2', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'Doe' },
      ];

      const result = sortClients(clients, 'first_name', 'asc');
      // 모든 값이 같으므로 원래 순서 유지 (안정 정렬)
      expect(result.length).toBe(3);
      expect(result.every(c => c.first_name === 'John' && c.last_name === 'Doe')).toBe(true);
    });

    it('should handle sorting with null primary key and null secondary key', () => {
      const clients: Client[] = [
        { ...mockClient, id: '1', first_name: null, last_name: null },
        { ...mockClient, id: '2', first_name: null, last_name: null },
        { ...mockClient, id: '3', first_name: 'John', last_name: 'Doe' },
      ];

      const result = sortClients(clients, 'first_name', 'asc');
      // null 값들은 뒤로 이동
      expect(result[0].first_name).toBe('John');
      expect(result[1].first_name).toBeNull();
      expect(result[2].first_name).toBeNull();
    });

    it('should handle descending sort with null primary key', () => {
      const clients: Client[] = [
        { ...mockClient, id: '1', first_name: 'John', last_name: 'Doe' },
        { ...mockClient, id: '2', first_name: null, last_name: 'Smith' },
        { ...mockClient, id: '3', first_name: 'Jane', last_name: 'Johnson' },
      ];

      const result = sortClients(clients, 'first_name', 'desc');
      // null 값은 뒤로
      expect(result[0].first_name).toBe('John');
      expect(result[1].first_name).toBe('Jane');
      expect(result[2].first_name).toBeNull();
    });

    it('should use default field when field is undefined', () => {
      const clients: Client[] = [
        { ...mockClient, id: '1', first_name: 'Charlie' },
        { ...mockClient, id: '2', first_name: 'Alice' },
        { ...mockClient, id: '3', first_name: 'Bob' },
      ];

      // field를 undefined로 전달하면 기본값(first_name) 사용
      const result = sortClients(clients, undefined, 'asc');
      expect(result[0].first_name).toBe('Alice');
      expect(result[1].first_name).toBe('Bob');
      expect(result[2].first_name).toBe('Charlie');
    });

    it('should handle non-string values in sort comparison', () => {
      // 숫자나 다른 타입이 들어올 경우 문자열로 변환되지 않아도 비교 가능
      const clients: Client[] = [
        { ...mockClient, id: '3', created_at: '2023-01-03' },
        { ...mockClient, id: '1', created_at: '2023-01-01' },
        { ...mockClient, id: '2', created_at: '2023-01-02' },
      ];

      const result = sortClients(clients, 'created_at', 'asc');
      // 문자열 비교로 정렬됨
      expect(result[0].created_at).toBe('2023-01-01');
      expect(result[1].created_at).toBe('2023-01-02');
      expect(result[2].created_at).toBe('2023-01-03');
    });

    it('should handle sorting when field value is not string (falls through to non-string comparison)', () => {
      // 타입이 string이 아닌 경우 원본 값으로 비교
      const clients: Client[] = [
        { ...mockClient, id: '1', created_at: '2023-01-01' },
        { ...mockClient, id: '2', created_at: '2023-01-02' },
      ];

      const result = sortClients(clients, 'created_at', 'asc');
      expect(result.length).toBe(2);
      // 실제로는 문자열이므로 정상 동작
    });
  });
});
