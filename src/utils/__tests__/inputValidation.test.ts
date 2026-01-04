import {
  validateSortColumn,
  validateUUID,
  validateDateString,
  sanitizeString,
  sanitizeNumber,
  sanitizeEmail,
  sanitizeSearchTerm,
  escapePostgrestFilterValue,
  createPartialValidator,
  validatePartialUpdate,
  validateQueryParams,
  ALLOWED_SORT_COLUMNS,
} from '../inputValidation';
import { z } from 'zod';

describe('inputValidation', () => {
  describe('validateSortColumn', () => {
    it('should return default column when column is null', () => {
      const result = validateSortColumn('clients', null);
      expect(result).toBe('created_at'); // First column in clients array
    });

    it('should return column when it is in allowed list', () => {
      const result = validateSortColumn('clients', 'first_name');
      expect(result).toBe('first_name');
    });

    it('should return default column when column is not in allowed list', () => {
      const result = validateSortColumn('clients', 'invalid_column');
      expect(result).toBe('created_at'); // Default
    });

    it('should work for different tables', () => {
      expect(validateSortColumn('instruments', 'type')).toBe('type');
      expect(validateSortColumn('instruments', 'invalid')).toBe('created_at');
      expect(validateSortColumn('connections', 'created_at')).toBe(
        'created_at'
      );
      expect(validateSortColumn('maintenance_tasks', 'due_date')).toBe(
        'due_date'
      );
    });

    it('should return first allowed column as default for each table', () => {
      expect(validateSortColumn('clients', null)).toBe('created_at');
      expect(validateSortColumn('instruments', null)).toBe('created_at');
      expect(validateSortColumn('connections', null)).toBe('created_at');
      expect(validateSortColumn('maintenance_tasks', null)).toBe('created_at');
      expect(validateSortColumn('sales_history', null)).toBe('created_at');
    });
  });

  describe('validateUUID', () => {
    it('should return true for valid UUID', () => {
      expect(validateUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
      expect(validateUUID('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true);
    });

    it('should return false for invalid UUID', () => {
      expect(validateUUID('invalid-uuid')).toBe(false);
      expect(validateUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(validateUUID('123e4567e89b12d3a456426614174000')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(validateUUID(null)).toBe(false);
      expect(validateUUID(undefined)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(validateUUID('123e4567-E89B-12D3-A456-426614174000')).toBe(true);
    });
  });

  describe('validateDateString', () => {
    it('should return true for valid date string', () => {
      expect(validateDateString('2024-01-15')).toBe(true);
      expect(validateDateString('2024-12-31')).toBe(true);
      expect(validateDateString('2024-02-29')).toBe(true); // Leap year
    });

    it('should return false for invalid format', () => {
      expect(validateDateString('2024/01/15')).toBe(false);
      expect(validateDateString('01-15-2024')).toBe(false);
      expect(validateDateString('2024-1-15')).toBe(false);
      expect(validateDateString('2024-01-5')).toBe(false);
    });

    it('should return false for invalid dates', () => {
      expect(validateDateString('2024-02-30')).toBe(false); // February has max 29 days
      expect(validateDateString('2024-13-01')).toBe(false); // Invalid month
      expect(validateDateString('2024-01-32')).toBe(false); // Invalid day
    });

    it('should return false for null or undefined', () => {
      expect(validateDateString(null)).toBe(false);
      expect(validateDateString(undefined)).toBe(false);
    });

    it('should prevent auto-correction issues', () => {
      // date-fns parse will auto-correct, but our validation checks round-trip
      expect(validateDateString('2024-02-31')).toBe(false); // Auto-corrects to March 2, fails round-trip
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe(
        'scriptalert("xss")/script'
      );
      expect(sanitizeString('Hello <b>World</b>')).toBe('Hello bWorld/b');
    });

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00world')).toBe('helloworld');
      expect(sanitizeString('hello\nworld')).toBe('helloworld');
    });

    it('should return empty string for null or undefined', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should limit length when maxLength is provided', () => {
      expect(sanitizeString('1234567890', 5)).toBe('12345');
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    it('should not truncate when length is within limit', () => {
      expect(sanitizeString('hello', 10)).toBe('hello');
    });
  });

  describe('sanitizeNumber', () => {
    it('should return number when input is valid', () => {
      expect(sanitizeNumber(5)).toBe(5);
      expect(sanitizeNumber('5')).toBe(5);
      expect(sanitizeNumber(3.14)).toBe(3.14);
    });

    it('should return null for null or undefined', () => {
      expect(sanitizeNumber(null)).toBeNull();
      expect(sanitizeNumber(undefined)).toBeNull();
    });

    it('should return null for NaN', () => {
      expect(sanitizeNumber('invalid')).toBeNull();
      expect(sanitizeNumber(NaN)).toBeNull();
    });

    it('should clamp values when clamp is true (default)', () => {
      expect(sanitizeNumber(5, 1, 10)).toBe(5);
      expect(sanitizeNumber(0, 1, 10)).toBe(1); // Clamped to min
      expect(sanitizeNumber(15, 1, 10)).toBe(10); // Clamped to max
    });

    it('should return null when clamp is false and value is out of range', () => {
      expect(sanitizeNumber(0, 1, 10, false)).toBeNull();
      expect(sanitizeNumber(15, 1, 10, false)).toBeNull();
    });

    it('should allow values within range when clamp is false', () => {
      expect(sanitizeNumber(5, 1, 10, false)).toBe(5);
      expect(sanitizeNumber(1, 1, 10, false)).toBe(1);
      expect(sanitizeNumber(10, 1, 10, false)).toBe(10);
    });

    it('should handle only min constraint', () => {
      expect(sanitizeNumber(5, 1, undefined)).toBe(5);
      expect(sanitizeNumber(0, 1, undefined)).toBe(1);
    });

    it('should handle only max constraint', () => {
      expect(sanitizeNumber(5, undefined, 10)).toBe(5);
      expect(sanitizeNumber(15, undefined, 10)).toBe(10);
    });
  });

  describe('sanitizeEmail', () => {
    it('should return sanitized email for valid email', () => {
      expect(sanitizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
      expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
    });

    it('should return null for invalid email', () => {
      expect(sanitizeEmail('invalid')).toBeNull();
      expect(sanitizeEmail('invalid@')).toBeNull();
      expect(sanitizeEmail('@example.com')).toBeNull();
      expect(sanitizeEmail('user@')).toBeNull();
    });

    it('should return null for null or undefined', () => {
      expect(sanitizeEmail(null)).toBeNull();
      expect(sanitizeEmail(undefined)).toBeNull();
    });

    it('should handle emails with special characters', () => {
      expect(sanitizeEmail('user+tag@example.com')).toBe(
        'user+tag@example.com'
      );
      expect(sanitizeEmail('user.name@example.co.uk')).toBe(
        'user.name@example.co.uk'
      );
    });
  });

  describe('sanitizeSearchTerm', () => {
    it('should trim whitespace', () => {
      expect(sanitizeSearchTerm('  hello  ')).toBe('hello');
    });

    it('should limit length to default maxLength (100)', () => {
      const longString = 'a'.repeat(150);
      expect(sanitizeSearchTerm(longString).length).toBe(100);
    });

    it('should limit length to custom maxLength', () => {
      const longString = 'a'.repeat(50);
      expect(sanitizeSearchTerm(longString, 10).length).toBe(10);
    });

    it('should remove control characters', () => {
      expect(sanitizeSearchTerm('hello\x00world')).toBe('helloworld');
    });

    it('should return empty string for null or undefined', () => {
      expect(sanitizeSearchTerm(null)).toBe('');
      expect(sanitizeSearchTerm(undefined)).toBe('');
    });
  });

  describe('escapePostgrestFilterValue', () => {
    it('should escape wildcard and filter characters', () => {
      const value = escapePostgrestFilterValue('50%_off,(test)');
      expect(value).toBe('50\\%\\_off\\,\\(test\\)');
    });

    it('should escape backslashes', () => {
      expect(escapePostgrestFilterValue('a\\b')).toBe('a\\\\b');
    });
  });

  describe('createPartialValidator', () => {
    it('should create partial validator from full schema', () => {
      const fullSchema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      });

      const partialValidator = createPartialValidator(fullSchema);

      // Should accept partial objects
      const result = partialValidator.safeParse({ name: 'John' });
      expect(result.success).toBe(true);
    });

    it('should allow all fields to be optional', () => {
      const fullSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const partialValidator = createPartialValidator(fullSchema);

      expect(partialValidator.safeParse({}).success).toBe(true);
      expect(partialValidator.safeParse({ name: 'John' }).success).toBe(true);
      expect(partialValidator.safeParse({ age: 30 }).success).toBe(true);
    });
  });

  describe('validatePartialUpdate', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
      email: z.string().email(),
    });
    const partialValidator = createPartialValidator(testSchema);

    it('should return success for valid partial update', () => {
      const result = validatePartialUpdate({ name: 'John' }, partialValidator);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
      }
    });

    it('should return error for invalid data type', () => {
      const result = validatePartialUpdate('invalid', partialValidator);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Update data must be an object');
      }
    });

    it('should return error for null', () => {
      const result = validatePartialUpdate(null, partialValidator);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Update data must be an object');
      }
    });

    it('should return error with validation message for invalid field', () => {
      const result = validatePartialUpdate(
        { name: '' }, // Empty string fails min(1)
        partialValidator
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod error message format: "Too small: expected string to have >=1 characters"
        expect(result.error).toBeTruthy();
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateQueryParams', () => {
    it('should return defaults when params are empty', () => {
      const result = validateQueryParams({});

      expect(result.orderBy).toBe('created_at');
      expect(result.ascending).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.search).toBeUndefined();
    });

    it('should validate orderBy with allowed columns', () => {
      const result = validateQueryParams(
        { orderBy: 'first_name' },
        { allowedColumns: ['first_name', 'last_name', 'created_at'] }
      );

      expect(result.orderBy).toBe('first_name');
    });

    it('should use default when orderBy is not in allowed columns', () => {
      const result = validateQueryParams(
        { orderBy: 'invalid_column' },
        {
          allowedColumns: ['first_name', 'last_name'],
          defaultColumn: 'last_name',
        }
      );

      expect(result.orderBy).toBe('last_name');
    });

    it('should validate ascending flag', () => {
      expect(validateQueryParams({ ascending: 'true' }).ascending).toBe(true);
      expect(validateQueryParams({ ascending: 'false' }).ascending).toBe(false);
      expect(validateQueryParams({ ascending: 'anything' }).ascending).toBe(
        true
      );
    });

    it('should validate page number', () => {
      expect(validateQueryParams({ page: '5' }).page).toBe(5);
      expect(validateQueryParams({ page: '0' }).page).toBe(1); // Min is 1
      expect(validateQueryParams({ page: '-1' }).page).toBe(1);
      expect(validateQueryParams({ page: 'invalid' }).page).toBe(1);
    });

    it('should validate pageSize with max limit', () => {
      expect(validateQueryParams({ pageSize: '20' }).pageSize).toBe(20);
      expect(
        validateQueryParams({ pageSize: '200' }, { maxPageSize: 100 }).pageSize
      ).toBe(100);
      // parseInt('0') = 0, then 0 || 10 = 10, then Math.max(1, 10) = 10
      expect(validateQueryParams({ pageSize: '0' }).pageSize).toBe(10);
      // parseInt('invalid') returns NaN, which || 10 becomes 10, then Math.max(1, 10) = 10
      expect(validateQueryParams({ pageSize: 'invalid' }).pageSize).toBe(10);
      // parseInt('1') = 1, then 1 || 10 = 1, then Math.max(1, 1) = 1
      expect(validateQueryParams({ pageSize: '1' }).pageSize).toBe(1);
    });

    it('should sanitize search term', () => {
      const result = validateQueryParams({ search: '  hello world  ' });

      expect(result.search).toBe('hello world');
    });

    it('should return undefined for empty search', () => {
      const result = validateQueryParams({ search: '   ' });

      expect(result.search).toBeUndefined();
    });

    it('should handle all params together', () => {
      const result = validateQueryParams(
        {
          orderBy: 'name',
          ascending: 'false',
          page: '3',
          pageSize: '25',
          search: 'test',
        },
        {
          allowedColumns: ['name', 'created_at'],
          defaultColumn: 'created_at',
          maxPageSize: 50,
        }
      );

      expect(result.orderBy).toBe('name');
      expect(result.ascending).toBe(false);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(25);
      expect(result.search).toBe('test');
    });
  });

  describe('ALLOWED_SORT_COLUMNS', () => {
    it('should contain expected columns for clients', () => {
      expect(ALLOWED_SORT_COLUMNS.clients).toContain('created_at');
      expect(ALLOWED_SORT_COLUMNS.clients).toContain('first_name');
      expect(ALLOWED_SORT_COLUMNS.clients).toContain('last_name');
      expect(ALLOWED_SORT_COLUMNS.clients).toContain('email');
    });

    it('should contain expected columns for instruments', () => {
      expect(ALLOWED_SORT_COLUMNS.instruments).toContain('type');
      expect(ALLOWED_SORT_COLUMNS.instruments).toContain('maker');
      expect(ALLOWED_SORT_COLUMNS.instruments).toContain('status');
    });

    it('should contain expected columns for maintenance_tasks', () => {
      expect(ALLOWED_SORT_COLUMNS.maintenance_tasks).toContain('due_date');
      expect(ALLOWED_SORT_COLUMNS.maintenance_tasks).toContain('status');
      expect(ALLOWED_SORT_COLUMNS.maintenance_tasks).toContain('priority');
    });
  });
});
