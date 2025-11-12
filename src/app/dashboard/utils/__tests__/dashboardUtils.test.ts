import {
  formatInstrumentName,
  formatInstrumentPrice,
  formatInstrumentYear,
  getStatusColor,
  getStatusIcon,
  formatClientName,
  getClientInitials,
  getRelationshipColor,
  getRelationshipIcon,
  getPriceRange,
  validateInstrumentData,
  formatFileSize,
  validateImageFile,
} from '../dashboardUtils';
import { Instrument, Client, ClientInstrument } from '@/types';

describe('dashboardUtils', () => {
  describe('formatInstrumentName', () => {
    it('should format instrument name with maker and type', () => {
      const instrument: Instrument = {
        id: '1',
        status: 'Available',
        maker: 'Stradivari',
        type: 'Violin',
        subtype: null,
        year: null,
        certificate: false,
        size: null,
        weight: null,
        price: null,
        ownership: null,
        note: null,
        serial_number: null,
        created_at: '2024-01-01',
      };
      expect(formatInstrumentName(instrument)).toBe('Stradivari - Violin');
    });

    it('should handle missing maker', () => {
      const instrument: Instrument = {
        id: '1',
        status: 'Available',
        maker: null,
        type: 'Violin',
        subtype: null,
        year: null,
        certificate: false,
        size: null,
        weight: null,
        price: null,
        ownership: null,
        note: null,
        serial_number: null,
        created_at: '2024-01-01',
      };
      expect(formatInstrumentName(instrument)).toBe('Unknown - Violin');
    });

    it('should handle missing type', () => {
      const instrument: Instrument = {
        id: '1',
        status: 'Available',
        maker: 'Stradivari',
        type: null,
        subtype: null,
        serial_number: null,
        year: null,
        certificate: false,
        size: null,
        weight: null,
        price: null,
        ownership: null,
        note: null,
        created_at: '2024-01-01',
      };
      expect(formatInstrumentName(instrument)).toBe('Stradivari - Unknown');
    });
  });

  describe('formatInstrumentPrice', () => {
    it('should format number price', () => {
      expect(formatInstrumentPrice(10000)).toBe('$10,000');
    });

    it('should format number price as string', () => {
      expect(formatInstrumentPrice(5000)).toBe('$5,000');
    });

    it('should return N/A for null price', () => {
      expect(formatInstrumentPrice(null)).toBe('N/A');
    });

    it('should return N/A for invalid price', () => {
      // formatInstrumentPrice는 number | string | null을 받음
      // 'invalid' 문자열은 parseFloat로 NaN이 되어 'N/A'를 반환
      expect(formatInstrumentPrice('invalid')).toBe('N/A');
    });

    it('should handle large prices', () => {
      expect(formatInstrumentPrice(1000000)).toBe('$1,000,000');
    });
  });

  describe('formatInstrumentYear', () => {
    it('should format number year', () => {
      expect(formatInstrumentYear(1700)).toBe('1700');
    });

    it('should format string year', () => {
      expect(formatInstrumentYear('1750')).toBe('1750');
    });

    it('should return Unknown for null year', () => {
      expect(formatInstrumentYear(null)).toBe('Unknown');
    });

    it('should return Unknown for 0 year', () => {
      expect(formatInstrumentYear(0)).toBe('Unknown');
    });

    it('should return Unknown for invalid year', () => {
      expect(formatInstrumentYear('invalid')).toBe('Unknown');
    });
  });

  describe('getStatusColor', () => {
    it('should return green for Available', () => {
      expect(getStatusColor('Available')).toBe('bg-green-100 text-green-800');
    });

    it('should return red for Sold', () => {
      expect(getStatusColor('Sold')).toBe('bg-red-100 text-red-800');
    });

    it('should return yellow for Reserved', () => {
      expect(getStatusColor('Reserved')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('should return blue for Maintenance', () => {
      expect(getStatusColor('Maintenance')).toBe('bg-blue-100 text-blue-800');
    });

    it('should return gray for unknown status', () => {
      expect(getStatusColor('Unknown')).toBe('bg-gray-100 text-gray-800');
    });
  });

  describe('getStatusIcon', () => {
    it('should return checkmark for Available', () => {
      expect(getStatusIcon('Available')).toBe('✅');
    });

    it('should return money for Sold', () => {
      expect(getStatusIcon('Sold')).toBe('💰');
    });

    it('should return lock for Reserved', () => {
      expect(getStatusIcon('Reserved')).toBe('🔒');
    });

    it('should return wrench for Maintenance', () => {
      expect(getStatusIcon('Maintenance')).toBe('🔧');
    });

    it('should return question for unknown status', () => {
      expect(getStatusIcon('Unknown')).toBe('❓');
    });
  });

  describe('formatClientName', () => {
    it('should format full name', () => {
      const client: Client = {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(formatClientName(client)).toBe('John Doe');
    });

    it('should handle missing last name', () => {
      const client: Client = {
        id: '1',
        first_name: 'John',
        last_name: null,
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(formatClientName(client)).toBe('John');
    });

    it('should handle missing first name', () => {
      const client: Client = {
        id: '1',
        first_name: null,
        last_name: 'Doe',
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(formatClientName(client)).toBe('Doe');
    });

    it('should return Unknown Client for empty names', () => {
      const client: Client = {
        id: '1',
        first_name: null,
        last_name: null,
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(formatClientName(client)).toBe('Unknown Client');
    });
  });

  describe('getClientInitials', () => {
    it('should return initials from full name', () => {
      const client: Client = {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(getClientInitials(client)).toBe('JD');
    });

    it('should handle missing last name', () => {
      const client: Client = {
        id: '1',
        first_name: 'John',
        last_name: null,
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(getClientInitials(client)).toBe('J');
    });

    it('should handle missing first name', () => {
      const client: Client = {
        id: '1',
        first_name: null,
        last_name: 'Doe',
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(getClientInitials(client)).toBe('D');
    });

    it('should return U for empty names', () => {
      const client: Client = {
        id: '1',
        first_name: null,
        last_name: null,
        contact_number: null,
        email: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01',
      };
      expect(getClientInitials(client)).toBe('U');
    });
  });

  describe('getRelationshipColor', () => {
    it('should return yellow for Interested', () => {
      expect(getRelationshipColor('Interested')).toBe(
        'bg-yellow-100 text-yellow-800'
      );
    });

    it('should return blue for Booked', () => {
      expect(getRelationshipColor('Booked')).toBe('bg-blue-100 text-blue-800');
    });

    it('should return green for Sold', () => {
      expect(getRelationshipColor('Sold')).toBe('bg-green-100 text-green-800');
    });

    it('should return purple for Owned', () => {
      expect(getRelationshipColor('Owned')).toBe(
        'bg-purple-100 text-purple-800'
      );
    });

    it('should return gray for unknown type', () => {
      expect(
        getRelationshipColor('Unknown' as ClientInstrument['relationship_type'])
      ).toBe('bg-gray-100 text-gray-800');
    });
  });

  describe('getRelationshipIcon', () => {
    it('should return eye for Interested', () => {
      expect(getRelationshipIcon('Interested')).toBe('👀');
    });

    it('should return calendar for Booked', () => {
      expect(getRelationshipIcon('Booked')).toBe('📅');
    });

    it('should return checkmark for Sold', () => {
      expect(getRelationshipIcon('Sold')).toBe('✅');
    });

    it('should return house for Owned', () => {
      expect(getRelationshipIcon('Owned')).toBe('🏠');
    });

    it('should return question for unknown type', () => {
      expect(
        getRelationshipIcon('Unknown' as ClientInstrument['relationship_type'])
      ).toBe('❓');
    });
  });

  describe('getPriceRange', () => {
    it('should return min and max from instruments', () => {
      const instruments: Instrument[] = [
        {
          id: '1',
          status: 'Available',
          maker: null,
          type: null,
          subtype: null,
          year: null,
          certificate: false,
          size: null,
          weight: null,
          price: 1000,
          ownership: null,
          note: null,
          serial_number: null,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          status: 'Available',
          maker: null,
          type: null,
          subtype: null,
          year: null,
          certificate: false,
          size: null,
          weight: null,
          price: 5000,
          ownership: null,
          note: null,
          serial_number: null,
          created_at: '2024-01-01',
        },
        {
          id: '3',
          status: 'Available',
          maker: null,
          type: null,
          subtype: null,
          year: null,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          serial_number: null,
          created_at: '2024-01-01',
        },
      ];
      const range = getPriceRange(instruments);
      expect(range.min).toBe(1000);
      expect(range.max).toBe(5000);
    });

    it('should return 0,0 for empty array', () => {
      const range = getPriceRange([]);
      expect(range.min).toBe(0);
      expect(range.max).toBe(0);
    });

    it('should handle null prices', () => {
      const instruments: Instrument[] = [
        {
          id: '1',
          status: 'Available',
          maker: null,
          type: null,
          subtype: null,
          year: null,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          serial_number: null,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          status: 'Available',
          maker: null,
          type: null,
          subtype: null,
          year: null,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          serial_number: null,
          created_at: '2024-01-01',
        },
      ];
      const range = getPriceRange(instruments);
      expect(range.min).toBe(0);
      expect(range.max).toBe(0);
    });
  });

  describe('validateInstrumentData', () => {
    it('should validate required fields', () => {
      const errors = validateInstrumentData({});
      expect(errors).toContain('Maker is required');
      expect(errors).toContain('Type is required');
    });

    it('should pass with valid data', () => {
      const errors = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
      });
      expect(errors).toHaveLength(0);
    });

    it('should validate year range', () => {
      const errors1 = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
        year: 999,
      });
      expect(errors1).toContain('Year must be a valid year');

      const errors2 = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
        year: 2100,
      });
      expect(errors2).toContain('Year must be a valid year');

      const errors3 = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
        year: 1700,
      });
      expect(errors3).not.toContain('Year must be a valid year');
    });

    it('should validate price', () => {
      const errors1 = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
        price: -100,
      });
      expect(errors1).toContain('Price must be a valid positive number');

      const errors2 = validateInstrumentData({
        maker: 'Stradivari',
        type: 'Violin',
        price: 100,
      });
      expect(errors2).not.toContain('Price must be a valid positive number');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('should format MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    });

    it('should format GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should round decimals', () => {
      expect(formatFileSize(1500)).toBe('1.46 KB');
    });
  });

  describe('validateImageFile', () => {
    it('should accept valid JPEG', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const errors = validateImageFile(file);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid PNG', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const errors = validateImageFile(file);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid WebP', () => {
      const file = new File([''], 'test.webp', { type: 'image/webp' });
      const errors = validateImageFile(file);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid type', () => {
      const file = new File([''], 'test.gif', { type: 'image/gif' });
      const errors = validateImageFile(file);
      expect(errors).toContain('Only JPEG, PNG, and WebP images are allowed');
    });

    it('should reject large files', () => {
      const blob = new Blob(['x'.repeat(6 * 1024 * 1024)]);
      const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });
      const errors = validateImageFile(file);
      expect(errors).toContain('File size must be less than 5MB');
    });
  });
});
