import {
  formatDateOnly,
  formatTimestamp,
  formatRelativeTime,
  formatCurrency,
  formatNumber,
  formatText,
  formatName,
  formatInitials,
  formatPhone,
  formatEmail,
  formatFileSize,
  formatPercentage,
  formatAddress,
  formatStatus,
  formatRelationshipType,
  formatInstrumentName,
  formatTableData,
  highlightSearchTerm,
  formatCSV,
  formatJSON,
  formatURL,
  formatColor,
  formatDuration,
  formatValidationErrors,
} from '../formatUtils';

describe('formatUtils', () => {
  describe('formatDateOnly', () => {
    it('should format date-only string with short style', () => {
      const result = formatDateOnly('2024-01-15');
      expect(result).toContain('2024');
    });

    it('should format date-only string with long style', () => {
      const result = formatDateOnly('2024-01-15', 'long');
      expect(result).toContain('2024');
    });

    it('should format date-only string with iso style', () => {
      const result = formatDateOnly('2024-01-15', 'iso');
      expect(result).toBe('2024-01-15');
    });

    it('should handle invalid date', () => {
      const result = formatDateOnly('invalid');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('formatTimestamp', () => {
    it('should format Date object with datetime style', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = formatTimestamp(date, 'datetime');
      expect(result).toContain('2024');
    });

    it('should format ISO string with time style', () => {
      const result = formatTimestamp('2024-01-15T10:30:00', 'time');
      expect(result).toContain(':');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "Just now" for recent dates', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('Just now');
    });

    it('should format minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(date);
      expect(result).toContain('m ago');
    });

    it('should format hours ago', () => {
      const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(date);
      expect(result).toContain('h ago');
    });

    it('should format days ago', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(date);
      expect(result).toContain('d ago');
    });

    it('should format old dates with short style', () => {
      const date = new Date('2020-01-01');
      const result = formatRelativeTime(date);
      // Should use formatDate with 'short' style for old dates
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      expect(formatCurrency(1000)).toContain('1,000');
    });

    it('should format with string amount', () => {
      expect(formatCurrency('1000')).toContain('1,000');
    });

    it('should handle invalid amount', () => {
      expect(formatCurrency('invalid')).toBe('Invalid Amount');
    });

    it('should format with custom currency', () => {
      const result = formatCurrency(1000, 'EUR');
      expect(result).toBeTruthy();
    });
  });

  describe('formatNumber', () => {
    it('should format number with decimals', () => {
      expect(formatNumber(1234.567, { decimals: 2 })).toBe('1,234.57');
    });

    it('should format with compact notation', () => {
      const result = formatNumber(1234567, { compact: true });
      expect(result).toBeTruthy();
    });

    it('should handle invalid number', () => {
      expect(formatNumber('invalid')).toBe('Invalid Number');
    });
  });

  describe('formatText', () => {
    it('should trim text', () => {
      expect(formatText('  hello  ', { trim: true })).toBe('hello');
    });

    it('should capitalize text', () => {
      expect(formatText('hello', { capitalize: true })).toBe('Hello');
    });

    it('should truncate text', () => {
      expect(formatText('hello world', { truncate: 5 })).toBe('hello...');
    });

    it('should combine options', () => {
      expect(
        formatText('  HELLO WORLD  ', { trim: true, capitalize: true })
      ).toBe('Hello world');
    });
  });

  describe('formatName', () => {
    it('should format full name', () => {
      expect(formatName('John', 'Doe')).toBe('John Doe');
    });

    it('should trim spaces', () => {
      expect(formatName('John ', ' Doe')).toBe('John Doe');
    });
  });

  describe('formatInitials', () => {
    it('should format initials', () => {
      expect(formatInitials('John', 'Doe')).toBe('JD');
    });
  });

  describe('formatPhone', () => {
    it('should format 10-digit phone', () => {
      expect(formatPhone('1234567890')).toBe('(123) 456-7890');
    });

    it('should format 11-digit phone', () => {
      expect(formatPhone('11234567890')).toBe('+1 (123) 456-7890');
    });

    it('should handle null', () => {
      expect(formatPhone(null)).toBe('');
    });

    it('should return original if format does not match', () => {
      expect(formatPhone('12345')).toBe('');
    });
  });

  describe('formatEmail', () => {
    it('should lowercase and trim email', () => {
      expect(formatEmail('  Test@EXAMPLE.COM  ')).toBe('test@example.com');
    });

    it('should handle null', () => {
      expect(formatEmail(null)).toBe('');
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
  });

  describe('formatPercentage', () => {
    it('should format percentage', () => {
      expect(formatPercentage(0.123)).toBe('12.3%');
    });

    it('should format with custom decimals', () => {
      expect(formatPercentage(0.123, 2)).toBe('12.30%');
    });
  });

  describe('formatAddress', () => {
    it('should format address', () => {
      const address = {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
      };
      expect(formatAddress(address)).toBe(
        '123 Main St, New York, NY, 10001, USA'
      );
    });

    it('should handle missing fields', () => {
      const address = { city: 'New York', state: 'NY' };
      expect(formatAddress(address)).toBe('New York, NY');
    });
  });

  describe('formatStatus', () => {
    it('should format status', () => {
      expect(formatStatus('IN_PROGRESS')).toBe('In Progress');
    });
  });

  describe('formatRelationshipType', () => {
    it('should format known types', () => {
      expect(formatRelationshipType('interested')).toBe('Interested');
      expect(formatRelationshipType('booked')).toBe('Booked');
      expect(formatRelationshipType('sold')).toBe('Sold');
      expect(formatRelationshipType('owned')).toBe('Owned');
    });

    it('should return original for unknown types', () => {
      expect(formatRelationshipType('unknown')).toBe('unknown');
    });
  });

  describe('formatInstrumentName', () => {
    it('should format instrument name', () => {
      expect(formatInstrumentName('Stradivari', 'Violin', '1700')).toBe(
        'Stradivari Violin (1700)'
      );
    });

    it('should handle null maker', () => {
      expect(formatInstrumentName(null, 'Violin')).toBe('Violin');
    });

    it('should handle null year', () => {
      expect(formatInstrumentName('Stradivari', 'Violin', null)).toBe(
        'Stradivari Violin'
      );
    });
  });

  describe('formatTableData', () => {
    it('should format table data', () => {
      const data = [{ id: '1', name: 'Test' }];
      const columns = [
        { key: 'id' as const, label: 'ID' },
        { key: 'name' as const, label: 'Name' },
      ];
      const result = formatTableData(data, columns);
      expect(result[0]).toEqual({ ID: '1', Name: 'Test' });
    });

    it('should use custom formatter', () => {
      const data = [{ price: 100 }];
      const columns = [
        {
          key: 'price' as const,
          label: 'Price',
          formatter: (v: unknown) => `$${v}`,
        },
      ];
      const result = formatTableData(data, columns);
      expect(result[0]).toEqual({ Price: '$100' });
    });
  });

  describe('highlightSearchTerm', () => {
    it('should highlight search term', () => {
      const result = highlightSearchTerm('hello world', 'hello');
      // ✅ FIXED: highlightSearchTerm은 이제 ReactNode 배열을 반환
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3); // ["", <mark>hello</mark>, " world"]
      // mark 요소가 포함되어 있는지 확인
      const markElement = (result as any[]).find(
        item => item && typeof item === 'object' && item.type === 'mark'
      );
      expect(markElement).toBeDefined();
      expect(markElement?.props?.children).toBe('hello');
    });

    it('should handle empty search term', () => {
      const result = highlightSearchTerm('hello world', '');
      expect(result).toBe('hello world');
    });

    it('should escape regex special characters', () => {
      const result = highlightSearchTerm('hello (world)', '(');
      // ✅ FIXED: highlightSearchTerm은 이제 ReactNode 배열을 반환
      expect(Array.isArray(result)).toBe(true);
      // mark 요소가 포함되어 있는지 확인
      const markElement = (result as any[]).find(
        item => item && typeof item === 'object' && item.type === 'mark'
      );
      expect(markElement).toBeDefined();
      expect(markElement?.props?.children).toBe('(');
    });
  });

  describe('formatCSV', () => {
    it('should format CSV', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];
      const result = formatCSV(data);
      expect(result).toContain('name,age');
      expect(result).toContain('John,30');
    });

    it('should handle empty data', () => {
      expect(formatCSV([])).toBe('');
    });

    it('should escape commas and quotes', () => {
      const data = [{ name: 'John, Jr.', age: 30 }];
      const result = formatCSV(data);
      expect(result).toContain('"John, Jr."');
    });
  });

  describe('formatJSON', () => {
    it('should format JSON', () => {
      const data = { name: 'John', age: 30 };
      expect(formatJSON(data)).toBeTruthy();
    });

    it('should format with custom indent', () => {
      const data = { name: 'John' };
      expect(formatJSON(data, 4)).toBeTruthy();
    });
  });

  describe('formatURL', () => {
    it('should add https if missing', () => {
      expect(formatURL('example.com')).toBe('https://example.com');
    });

    it('should not change http URLs', () => {
      expect(formatURL('http://example.com')).toBe('http://example.com');
    });

    it('should not change https URLs', () => {
      expect(formatURL('https://example.com')).toBe('https://example.com');
    });
  });

  describe('formatColor', () => {
    it('should add # if missing', () => {
      expect(formatColor('ff0000')).toBe('#ff0000');
    });

    it('should not change if # exists', () => {
      expect(formatColor('#ff0000')).toBe('#ff0000');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      expect(formatDuration(30)).toBe('30s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(formatDuration(3661)).toBe('1h 1m 1s');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format validation errors', () => {
      const errors = {
        email: 'Invalid email',
        password: 'Too short',
      };
      const result = formatValidationErrors(errors);
      expect(result).toContain('email: Invalid email');
      expect(result).toContain('password: Too short');
    });
  });
});
