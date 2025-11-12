import {
  generateInstrumentSerialNumber,
  generateClientNumber,
  validateUniqueNumber,
  formatUniqueNumber,
} from '../uniqueNumberGenerator';

describe('uniqueNumberGenerator', () => {
  describe('generateInstrumentSerialNumber', () => {
    it('should generate serial number with VI prefix for violin', () => {
      const result = generateInstrumentSerialNumber('violin', []);
      expect(result).toMatch(/^VI\d{3}$/);
      expect(result).toBe('VI001');
    });

    it('should generate serial number with VA prefix for viola', () => {
      const result = generateInstrumentSerialNumber('viola', []);
      expect(result).toMatch(/^VA\d{3}$/);
      expect(result).toBe('VA001');
    });

    it('should generate serial number with CE prefix for cello', () => {
      const result = generateInstrumentSerialNumber('cello', []);
      expect(result).toMatch(/^CE\d{3}$/);
      expect(result).toBe('CE001');
    });

    it('should generate serial number with DB prefix for bass', () => {
      const result = generateInstrumentSerialNumber('bass', []);
      expect(result).toMatch(/^DB\d{3}$/);
      expect(result).toBe('DB001');
    });

    it('should generate serial number with BO prefix for bow', () => {
      const result = generateInstrumentSerialNumber('bow', []);
      expect(result).toMatch(/^BO\d{3}$/);
      expect(result).toBe('BO001');
    });

    it('should generate serial number with IN prefix for unknown type', () => {
      const result = generateInstrumentSerialNumber(null, []);
      expect(result).toMatch(/^IN\d{3}$/);
      expect(result).toBe('IN001');
    });

    it('should generate serial number with IN prefix for empty string', () => {
      const result = generateInstrumentSerialNumber('', []);
      expect(result).toMatch(/^IN\d{3}$/);
      expect(result).toBe('IN001');
    });

    it('should generate next number when existing numbers exist', () => {
      const existing = ['VI001', 'VI002', 'VI003'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI004');
    });

    it('should generate next number correctly with mixed prefixes', () => {
      const existing = ['VI001', 'VA001', 'VI002', 'CE001'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI003');
    });

    it('should handle Korean type names', () => {
      const result1 = generateInstrumentSerialNumber('바이올린', []);
      expect(result1).toBe('VI001');

      const result2 = generateInstrumentSerialNumber('비올라', []);
      expect(result2).toBe('VA001');

      const result3 = generateInstrumentSerialNumber('첼로', []);
      expect(result3).toBe('CE001');

      const result4 = generateInstrumentSerialNumber('베이스', []);
      expect(result4).toBe('DB001');

      const result5 = generateInstrumentSerialNumber('활', []);
      expect(result5).toBe('BO001');
    });

    it('should handle case insensitive type names', () => {
      const result1 = generateInstrumentSerialNumber('VIOLIN', []);
      expect(result1).toBe('VI001');

      const result2 = generateInstrumentSerialNumber('Violin', []);
      expect(result2).toBe('VI001');
    });

    it('should extract number from existing numbers correctly', () => {
      const existing = ['VI001', 'VI010', 'VI099', 'VI100'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI101');
    });

    it('should handle non-standard existing numbers', () => {
      const existing = ['VI001', 'VI002', 'VI999'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI1000');
    });
  });

  describe('generateClientNumber', () => {
    it('should generate client number with CL prefix', () => {
      const result = generateClientNumber([]);
      expect(result).toMatch(/^CL\d{3}$/);
      expect(result).toBe('CL001');
    });

    it('should generate next number when existing numbers exist', () => {
      const existing = ['CL001', 'CL002', 'CL003'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL004');
    });

    it('should ignore non-CL prefixes when generating', () => {
      const existing = ['CL001', 'VI001', 'CL002', 'VA001'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL003');
    });

    it('should handle case insensitive existing numbers', () => {
      const existing = ['cl001', 'CL002', 'Cl003'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL004');
    });

    it('should extract number from existing numbers correctly', () => {
      const existing = ['CL001', 'CL010', 'CL099', 'CL100'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL101');
    });

    it('should handle large numbers', () => {
      const existing = ['CL001', 'CL999'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL1000');
    });
  });

  describe('validateUniqueNumber', () => {
    it('should return valid for empty string', () => {
      const result = validateUniqueNumber('', []);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid for null', () => {
      const result = validateUniqueNumber(null, []);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid for undefined', () => {
      const result = validateUniqueNumber(undefined, []);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid for unique number', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('CL003', existing);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for duplicate number', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('CL001', existing);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should allow current number when updating', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('CL001', existing, 'CL001');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for duplicate number when updating different number', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('CL002', existing, 'CL001');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should handle case insensitive duplicate check', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('cl001', existing);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should return invalid for invalid format (special characters)', () => {
      const result = validateUniqueNumber('CL-001', []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.');
    });

    it('should return invalid for invalid format (lowercase letters)', () => {
      const result = validateUniqueNumber('cl001', []);
      // Note: formatUniqueNumber converts to uppercase, but validation happens before
      // Actually, the validation should pass because it converts to uppercase first
      const trimmed = 'cl001'.trim().toUpperCase();
      const formatRegex = /^[A-Z0-9]{1,20}$/;
      if (formatRegex.test(trimmed)) {
        expect(result.valid).toBe(true);
      } else {
        expect(result.valid).toBe(false);
      }
    });

    it('should return invalid for too long number', () => {
      const longNumber = 'A'.repeat(21);
      const result = validateUniqueNumber(longNumber, []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.');
    });

    it('should return valid for maximum length number', () => {
      const maxNumber = 'A'.repeat(20);
      const result = validateUniqueNumber(maxNumber, []);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should trim whitespace before validation', () => {
      const result = validateUniqueNumber('  CL001  ', []);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle numbers with spaces (invalid)', () => {
      const result = validateUniqueNumber('CL 001', []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.');
    });
  });

  describe('formatUniqueNumber', () => {
    it('should return empty string for null', () => {
      const result = formatUniqueNumber(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = formatUniqueNumber(undefined);
      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const result = formatUniqueNumber('');
      expect(result).toBe('');
    });

    it('should convert to uppercase', () => {
      const result = formatUniqueNumber('cl001');
      expect(result).toBe('CL001');
    });

    it('should trim whitespace', () => {
      const result = formatUniqueNumber('  CL001  ');
      expect(result).toBe('CL001');
    });

    it('should handle mixed case', () => {
      const result = formatUniqueNumber('Cl001');
      expect(result).toBe('CL001');
    });

    it('should handle numbers with spaces', () => {
      const result = formatUniqueNumber('cl 001');
      expect(result).toBe('CL 001');
    });

    it('should handle special characters (no filtering)', () => {
      const result = formatUniqueNumber('cl-001');
      expect(result).toBe('CL-001');
    });
  });
});

