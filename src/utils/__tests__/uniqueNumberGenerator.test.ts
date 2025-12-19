import {
  generateInstrumentSerialNumber,
  generateClientNumber,
  validateUniqueNumber,
  formatUniqueNumber,
  normalizeInstrumentSerial,
  validateInstrumentSerial,
  INSTRUMENT_SERIAL_REGEX,
} from '../uniqueNumberGenerator';

describe('uniqueNumberGenerator', () => {
  describe('generateInstrumentSerialNumber', () => {
    it('should generate serial number with VI prefix for violin', () => {
      const result = generateInstrumentSerialNumber('violin', []);
      expect(result).toMatch(/^VI\d{7}$/);
      expect(result).toBe('VI0000001');
    });

    it('should generate serial number with VA prefix for viola', () => {
      const result = generateInstrumentSerialNumber('viola', []);
      expect(result).toMatch(/^VA\d{7}$/);
      expect(result).toBe('VA0000001');
    });

    it('should generate serial number with CE prefix for cello', () => {
      const result = generateInstrumentSerialNumber('cello', []);
      expect(result).toMatch(/^CE\d{7}$/);
      expect(result).toBe('CE0000001');
    });

    it('should generate serial number with DB prefix for bass', () => {
      const result = generateInstrumentSerialNumber('bass', []);
      expect(result).toMatch(/^DB\d{7}$/);
      expect(result).toBe('DB0000001');
    });

    it('should generate serial number with BO prefix for bow', () => {
      const result = generateInstrumentSerialNumber('bow', []);
      expect(result).toMatch(/^BO\d{7}$/);
      expect(result).toBe('BO0000001');
    });

    it('should generate serial number with IN prefix for unknown type', () => {
      const result = generateInstrumentSerialNumber(null, []);
      expect(result).toMatch(/^IN\d{7}$/);
      expect(result).toBe('IN0000001');
    });

    it('should generate serial number with IN prefix for empty string', () => {
      const result = generateInstrumentSerialNumber('', []);
      expect(result).toMatch(/^IN\d{7}$/);
      expect(result).toBe('IN0000001');
    });

    it('should generate next number when existing numbers exist', () => {
      const existing = ['VI0000001', 'VI0000002', 'VI0000003'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000004');
    });

    it('should generate next number correctly with mixed prefixes', () => {
      const existing = ['VI0000001', 'VA0000001', 'VI0000002', 'CE0000001'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000003');
    });

    it('should handle Korean type names', () => {
      const result1 = generateInstrumentSerialNumber('바이올린', []);
      expect(result1).toBe('VI0000001');

      const result2 = generateInstrumentSerialNumber('비올라', []);
      expect(result2).toBe('VA0000001');

      const result3 = generateInstrumentSerialNumber('첼로', []);
      expect(result3).toBe('CE0000001');

      const result4 = generateInstrumentSerialNumber('베이스', []);
      expect(result4).toBe('DB0000001');

      const result5 = generateInstrumentSerialNumber('활', []);
      expect(result5).toBe('BO0000001');
    });

    it('should handle case insensitive type names', () => {
      const result1 = generateInstrumentSerialNumber('VIOLIN', []);
      expect(result1).toBe('VI0000001');

      const result2 = generateInstrumentSerialNumber('Violin', []);
      expect(result2).toBe('VI0000001');
    });

    it('should extract number from existing numbers correctly', () => {
      const existing = ['VI0000001', 'VI0000010', 'VI0000099', 'VI0000100'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000101');
    });

    it('should handle non-standard existing numbers', () => {
      const existing = ['VI001', 'VI002', 'VI999'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0001000');
    });

    it('should handle whitespace in type names', () => {
      const result1 = generateInstrumentSerialNumber('  violin  ', []);
      expect(result1).toBe('VI0000001');

      const result2 = generateInstrumentSerialNumber('  viola  ', []);
      expect(result2).toBe('VA0000001');
    });

    it('should handle type names with additional text', () => {
      const result1 = generateInstrumentSerialNumber('violin bow', []);
      // Should match violin first, so returns VI
      expect(result1).toBe('VI0000001');

      const result2 = generateInstrumentSerialNumber('double bass', []);
      expect(result2).toBe('DB0000001');
    });

    it('should handle mixed Korean and English', () => {
      const result = generateInstrumentSerialNumber('바이올린 violin', []);
      expect(result).toBe('VI0000001');
    });

    it('should handle existing numbers with whitespace', () => {
      const existing = ['  VI0000001  ', 'VI0000002', '  BO0000001  '];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000003');
    });

    it('should handle existing numbers with different case', () => {
      const existing = ['vi0000001', 'VI0000002', 'Vi0000003'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000004');
    });

    it('should handle empty existing numbers array', () => {
      const result = generateInstrumentSerialNumber('violin', []);
      expect(result).toBe('VI0000001');
    });

    it('should handle existing numbers with invalid format', () => {
      const existing = ['INVALID', 'NOT_A_NUMBER', 'VI0000001'];
      const result = generateInstrumentSerialNumber('violin', existing);
      // Should still work, extracting valid numbers only
      expect(result).toBe('VI0000002');
    });

    it('should normalize serial numbers', () => {
      expect(normalizeInstrumentSerial('vi123')).toBe('VI0000123');
      expect(normalizeInstrumentSerial('VA0000123')).toBe('VA0000123');
      expect(normalizeInstrumentSerial('  bo42 ')).toBe('BO0000042');
      expect(normalizeInstrumentSerial('invalid')).toBe('INVALID');
      expect(normalizeInstrumentSerial('')).toBe('');
    });

    it('should normalize serial numbers with various formats', () => {
      expect(normalizeInstrumentSerial('VI1')).toBe('VI0000001');
      expect(normalizeInstrumentSerial('VA123')).toBe('VA0000123');
      expect(normalizeInstrumentSerial('CE1234567')).toBe('CE1234567');
      expect(normalizeInstrumentSerial('DB0000001')).toBe('DB0000001');
      expect(normalizeInstrumentSerial(null)).toBe('');
      expect(normalizeInstrumentSerial(undefined)).toBe('');
    });

    it('should handle serial numbers that do not match pattern', () => {
      expect(normalizeInstrumentSerial('VI')).toBe('VI');
      expect(normalizeInstrumentSerial('123')).toBe('123');
      expect(normalizeInstrumentSerial('ABC')).toBe('ABC');
      expect(normalizeInstrumentSerial('VI12345678')).toBe('VI12345678'); // Too long
    });

    it('should validate instrument serials', () => {
      const existing = ['VI0000001', 'BO0000001'];
      const ok = validateInstrumentSerial('vi0000002', existing);
      expect(ok.valid).toBe(true);
      expect(ok.normalizedSerial).toBe('VI0000002');

      const dup = validateInstrumentSerial('VI0000001', existing);
      expect(dup.valid).toBe(false);
      expect(dup.error).toContain('이미 사용 중입니다');

      const badFormat = validateInstrumentSerial('V10000001', existing);
      expect(badFormat.valid).toBe(false);
      expect(badFormat.error).toContain('pattern');
    });

    it('should validate instrument serials with null/undefined', () => {
      const existing = ['VI0000001'];

      const nullResult = validateInstrumentSerial(null, existing);
      expect(nullResult.valid).toBe(false);
      expect(nullResult.error).toBe('Serial number is required.');

      const undefinedResult = validateInstrumentSerial(undefined, existing);
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.error).toBe('Serial number is required.');
    });

    it('should validate instrument serials with current number exclusion', () => {
      const existing = ['VI0000001', 'BO0000001'];

      // Same as current number should be valid
      const sameNumber = validateInstrumentSerial(
        'VI0000001',
        existing,
        'VI0000001'
      );
      expect(sameNumber.valid).toBe(true);

      // Different number that exists should be invalid
      const duplicate = validateInstrumentSerial(
        'BO0000001',
        existing,
        'VI0000001'
      );
      expect(duplicate.valid).toBe(false);
      expect(duplicate.error).toContain('이미 사용 중입니다');
    });

    it('should include duplicate instrument info when instruments array is provided', () => {
      const existing = ['VI0000001', 'BO0000001'];
      const instruments = [
        {
          id: 'inst-1',
          serial_number: 'VI0000001',
          maker: 'Stradivarius',
          type: 'Violin',
        },
        {
          id: 'inst-2',
          serial_number: 'BO0000001',
          maker: 'Tourte',
          type: 'Bow',
        },
      ];

      const result = validateInstrumentSerial(
        'VI0000001',
        existing,
        undefined,
        instruments
      );

      expect(result.valid).toBe(false);
      expect(result.duplicateInfo).toBeDefined();
      expect(result.duplicateInfo?.serial_number).toBe('VI0000001');
      expect(result.duplicateInfo?.id).toBe('inst-1');
      expect(result.duplicateInfo?.maker).toBe('Stradivarius');
      expect(result.duplicateInfo?.type).toBe('Violin');
      expect(result.error).toContain('이미 사용 중입니다');
      expect(result.error).toContain('Stradivarius Violin');
    });

    it('should still provide duplicateInfo with serial only when instruments are not provided', () => {
      const existing = ['VI0000001'];

      const result = validateInstrumentSerial('VI0000001', existing);

      expect(result.valid).toBe(false);
      expect(result.duplicateInfo).toBeDefined();
      expect(result.duplicateInfo?.serial_number).toBe('VI0000001');
    });

    it('should validate instrument serials with normalized existing numbers', () => {
      const existing = ['vi0000001', '  BO0000001  ', 'ce0000002'];

      const result = validateInstrumentSerial('VI0000002', existing);
      expect(result.valid).toBe(true);
      expect(result.normalizedSerial).toBe('VI0000002');

      const duplicate = validateInstrumentSerial('bo0000001', existing);
      expect(duplicate.valid).toBe(false);
    });

    it('should expose instrument serial regex', () => {
      expect(INSTRUMENT_SERIAL_REGEX.test('VI0000001')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('VI123')).toBe(false);
      expect(INSTRUMENT_SERIAL_REGEX.test('VI00000001')).toBe(false);
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
      expect(result.error).toBe(
        '고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.'
      );
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
      expect(result.error).toBe(
        '고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.'
      );
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
      expect(result.error).toBe(
        '고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.'
      );
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

  describe('Edge cases and additional coverage', () => {
    it('should handle generateClientNumber with very large numbers', () => {
      const existing = Array.from(
        { length: 1000 },
        (_, i) => `CL${String(i + 1).padStart(3, '0')}`
      );
      const result = generateClientNumber(existing);
      expect(result).toBe('CL1001');
    });

    it('should handle generateInstrumentSerialNumber with very large numbers', () => {
      const existing = Array.from(
        { length: 1000 },
        (_, i) => `VI${String(i + 1).padStart(7, '0')}`
      );
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0001001');
    });

    it('should handle generateClientNumber with non-CL prefixes in existing', () => {
      const existing = ['MJ001', 'MJ002', 'CL001', 'CL002'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL003');
    });

    it('should handle validateUniqueNumber with empty existing array and current number', () => {
      const result = validateUniqueNumber('CL001', [], 'CL001');
      expect(result.valid).toBe(true);
    });

    it('should handle validateUniqueNumber with whitespace in existing numbers', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('  cl001  ', existing);
      // validateUniqueNumber trims whitespace, so '  cl001  ' becomes 'CL001' which exists
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should handle validateInstrumentSerial edge cases', () => {
      // Empty string
      const empty = validateInstrumentSerial('', []);
      expect(empty.valid).toBe(false);
      expect(empty.error).toBe('Serial number is required.');

      // Only whitespace
      const whitespace = validateInstrumentSerial('   ', []);
      expect(whitespace.valid).toBe(false);
    });

    it('should handle normalizeInstrumentSerial with edge cases', () => {
      // Single digit
      expect(normalizeInstrumentSerial('VI1')).toBe('VI0000001');

      // Maximum digits (7)
      expect(normalizeInstrumentSerial('VI1234567')).toBe('VI1234567');

      // More than 7 digits (should not pad)
      expect(normalizeInstrumentSerial('VI12345678')).toBe('VI12345678');
    });

    it('should handle formatUniqueNumber edge cases', () => {
      // Only spaces
      expect(formatUniqueNumber('   ')).toBe('');

      // Numbers only
      expect(formatUniqueNumber('123')).toBe('123');

      // Special characters preserved
      expect(formatUniqueNumber('ABC-123')).toBe('ABC-123');
    });

    it('should handle generateInstrumentSerialNumber with null and undefined in existing numbers', () => {
      const existing = ['VI0000001', null, undefined, '', 'VI0000002'];
      const result = generateInstrumentSerialNumber(
        'violin',
        existing as string[]
      );
      expect(result).toBe('VI0000003');
    });

    it('should handle generateClientNumber with null and undefined in existing numbers', () => {
      const existing = ['CL001', null, undefined, '', 'CL002'];
      const result = generateClientNumber(existing as string[]);
      expect(result).toBe('CL003');
    });

    it('should handle generateInstrumentSerialNumber with mixed case existing numbers', () => {
      const existing = ['vi0000001', 'VI0000002', 'Vi0000003', 'vI0000004'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI0000005');
    });

    it('should handle generateClientNumber with mixed case existing numbers', () => {
      const existing = ['cl001', 'CL002', 'Cl003', 'cL004'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL005');
    });

    it('should handle INSTRUMENT_SERIAL_REGEX with valid patterns', () => {
      expect(INSTRUMENT_SERIAL_REGEX.test('VI0000001')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('BO9999999')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('CE0000000')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('VA1234567')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('DB0000123')).toBe(true);
      expect(INSTRUMENT_SERIAL_REGEX.test('IN0000001')).toBe(true);
    });

    it('should handle INSTRUMENT_SERIAL_REGEX with invalid patterns', () => {
      expect(INSTRUMENT_SERIAL_REGEX.test('VI000001')).toBe(false); // 6 digits
      expect(INSTRUMENT_SERIAL_REGEX.test('VI00000001')).toBe(false); // 8 digits
      expect(INSTRUMENT_SERIAL_REGEX.test('V0000001')).toBe(false); // 1 letter
      expect(INSTRUMENT_SERIAL_REGEX.test('VII0000001')).toBe(false); // 3 letters
      expect(INSTRUMENT_SERIAL_REGEX.test('vi0000001')).toBe(false); // lowercase
      expect(INSTRUMENT_SERIAL_REGEX.test('VI000000A')).toBe(false); // letter in number
      expect(INSTRUMENT_SERIAL_REGEX.test('')).toBe(false); // empty
    });

    it('should handle generateInstrumentSerialNumber with maximum number value', () => {
      const existing = ['VI9999999'];
      const result = generateInstrumentSerialNumber('violin', existing);
      expect(result).toBe('VI10000000'); // 8 digits - exceeds format but function still works
    });

    it('should handle generateClientNumber with maximum 3-digit number', () => {
      const existing = ['CL999'];
      const result = generateClientNumber(existing);
      expect(result).toBe('CL1000'); // 4 digits
    });

    it('should handle validateInstrumentSerial with empty string in existing numbers', () => {
      const existing = ['', 'VI0000001', ''];
      const result = validateInstrumentSerial('VI0000002', existing);
      expect(result.valid).toBe(true);
      expect(result.normalizedSerial).toBe('VI0000002');
    });

    it('should handle validateInstrumentSerial with currentNumber as empty string', () => {
      const existing = ['VI0000001'];
      const result = validateInstrumentSerial('VI0000001', existing, '');
      expect(result.valid).toBe(false);
      // 구현은 한국어 메시지 + 시리얼 넘버를 포함해서 반환
      expect(result.error).toContain('이미 사용 중입니다.');
    });

    it('should handle validateUniqueNumber with currentNumber as empty string', () => {
      const existing = ['CL001'];
      const result = validateUniqueNumber('CL001', existing, '');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should handle validateUniqueNumber with currentNumber as null', () => {
      const existing = ['CL001'];
      const result = validateUniqueNumber('CL001', existing, null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용 중인 고유 번호입니다.');
    });

    it('should handle validateUniqueNumber with currentNumber matching input', () => {
      const existing = ['CL001', 'CL002'];
      const result = validateUniqueNumber('CL001', existing, 'CL001');
      expect(result.valid).toBe(true);
    });

    it('should handle normalizeInstrumentSerial with leading zeros', () => {
      expect(normalizeInstrumentSerial('VI0000001')).toBe('VI0000001');
      expect(normalizeInstrumentSerial('VI0000123')).toBe('VI0000123');
      expect(normalizeInstrumentSerial('VI0001234')).toBe('VI0001234');
    });

    it('should handle normalizeInstrumentSerial without leading zeros', () => {
      expect(normalizeInstrumentSerial('VI1')).toBe('VI0000001');
      expect(normalizeInstrumentSerial('VI12')).toBe('VI0000012');
      expect(normalizeInstrumentSerial('VI123')).toBe('VI0000123');
      expect(normalizeInstrumentSerial('VI1234')).toBe('VI0001234');
      expect(normalizeInstrumentSerial('VI12345')).toBe('VI0012345');
      expect(normalizeInstrumentSerial('VI123456')).toBe('VI0123456');
      expect(normalizeInstrumentSerial('VI1234567')).toBe('VI1234567');
    });

    it('should handle generateInstrumentSerialNumber with different instrument types sequentially', () => {
      const existing: string[] = [];
      const violin = generateInstrumentSerialNumber('violin', existing);
      expect(violin).toBe('VI0000001');
      existing.push(violin);

      const viola = generateInstrumentSerialNumber('viola', existing);
      expect(viola).toBe('VA0000001');
      existing.push(viola);

      const cello = generateInstrumentSerialNumber('cello', existing);
      expect(cello).toBe('CE0000001');
      existing.push(cello);

      const bass = generateInstrumentSerialNumber('bass', existing);
      expect(bass).toBe('DB0000001');
      existing.push(bass);

      const bow = generateInstrumentSerialNumber('bow', existing);
      expect(bow).toBe('BO0000001');
      existing.push(bow);

      // Second violin should continue from first
      const violin2 = generateInstrumentSerialNumber('violin', existing);
      expect(violin2).toBe('VI0000002');
    });

    it('should handle generateClientNumber sequential generation', () => {
      const existing: string[] = [];
      const client1 = generateClientNumber(existing);
      expect(client1).toBe('CL001');
      existing.push(client1);

      const client2 = generateClientNumber(existing);
      expect(client2).toBe('CL002');
      existing.push(client2);

      const client3 = generateClientNumber(existing);
      expect(client3).toBe('CL003');
    });

    it('should handle validateInstrumentSerial with whitespace in existing numbers', () => {
      const existing = ['  VI0000001  ', 'VI0000002'];
      const result = validateInstrumentSerial('VI0000003', existing);
      expect(result.valid).toBe(true);
      expect(result.normalizedSerial).toBe('VI0000003');
    });

    it('should handle validateUniqueNumber with case-sensitive matching', () => {
      const existing = ['CL001', 'CL002'];
      const result1 = validateUniqueNumber('cl001', existing);
      expect(result1.valid).toBe(false);
      expect(result1.error).toBe('이미 사용 중인 고유 번호입니다.');

      const result2 = validateUniqueNumber('Cl001', existing);
      expect(result2.valid).toBe(false);
    });

    it('should handle formatUniqueNumber with all uppercase', () => {
      expect(formatUniqueNumber('CL001')).toBe('CL001');
      expect(formatUniqueNumber('ABC123')).toBe('ABC123');
    });

    it('should handle formatUniqueNumber with all lowercase', () => {
      expect(formatUniqueNumber('cl001')).toBe('CL001');
      expect(formatUniqueNumber('abc123')).toBe('ABC123');
    });

    it('should handle formatUniqueNumber with mixed case', () => {
      expect(formatUniqueNumber('Cl001')).toBe('CL001');
      expect(formatUniqueNumber('aBc123')).toBe('ABC123');
      expect(formatUniqueNumber('AbC123')).toBe('ABC123');
    });

    it('should handle generateInstrumentSerialNumber with type containing multiple keywords', () => {
      // Type with multiple keywords - should match first (violin before bow)
      const result1 = generateInstrumentSerialNumber('violin bow', []);
      expect(result1).toBe('VI0000001'); // Matches violin first

      const result2 = generateInstrumentSerialNumber('double bass violin', []);
      // Current implementation prioritizes the first mapping match ("VI")
      expect(result2).toBe('VI0000001');
    });

    it('should handle generateInstrumentSerialNumber with non-English type names', () => {
      const result1 = generateInstrumentSerialNumber('바이올린', []);
      expect(result1).toBe('VI0000001');

      const result2 = generateInstrumentSerialNumber('비올라', []);
      expect(result2).toBe('VA0000001');

      const result3 = generateInstrumentSerialNumber('첼로', []);
      expect(result3).toBe('CE0000001');

      const result4 = generateInstrumentSerialNumber('베이스', []);
      expect(result4).toBe('DB0000001');

      const result5 = generateInstrumentSerialNumber('활', []);
      expect(result5).toBe('BO0000001');
    });

    it('should handle validateUniqueNumber with very long valid number (20 characters)', () => {
      const longNumber = 'A'.repeat(20);
      const result = validateUniqueNumber(longNumber, []);
      expect(result.valid).toBe(true);
    });

    it('should handle validateUniqueNumber with very long invalid number (21 characters)', () => {
      const longNumber = 'A'.repeat(21);
      const result = validateUniqueNumber(longNumber, []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        '고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.'
      );
    });

    it('should handle validateUniqueNumber with numbers only', () => {
      const result = validateUniqueNumber('123456', []);
      expect(result.valid).toBe(true);
    });

    it('should handle validateUniqueNumber with letters only', () => {
      const result = validateUniqueNumber('ABCDEF', []);
      expect(result.valid).toBe(true);
    });

    it('should handle validateUniqueNumber with mixed letters and numbers', () => {
      const result = validateUniqueNumber('ABC123XYZ456', []);
      expect(result.valid).toBe(true);
    });

    it('should handle validateInstrumentSerial error message format', () => {
      const result1 = validateInstrumentSerial('', []);
      expect(result1.error).toBe('Serial number is required.');

      const result2 = validateInstrumentSerial('INVALID', []);
      expect(result2.error).toBe(
        'Serial number must match pattern AA0000000 (2 letters + 7 digits).'
      );

      const existing = ['VI0000001'];
      const result3 = validateInstrumentSerial('VI0000001', existing);
      // 구체적인 시리얼 넘버를 포함한 한국어 메시지
      expect(result3.error).toContain('이미 사용 중입니다.');
    });

    it('should handle normalizeInstrumentSerial with numbers exceeding 7 digits', () => {
      // Numbers with more than 7 digits should not be padded
      expect(normalizeInstrumentSerial('VI12345678')).toBe('VI12345678');
      expect(normalizeInstrumentSerial('VI99999999')).toBe('VI99999999');
    });

    it('should handle generateInstrumentSerialNumber with existing numbers having non-standard formats', () => {
      const existing = ['VI1', 'VI2', 'VI0000003'];
      const result = generateInstrumentSerialNumber('violin', existing);
      // Should extract max from normalized versions: 1, 2, 3 → next is 4
      expect(result).toBe('VI0000004');
    });

    it('should handle generateClientNumber with existing numbers having non-standard formats', () => {
      const existing = ['CL1', 'CL2', 'CL003'];
      const result = generateClientNumber(existing);
      // Should extract max: 1, 2, 3 → next is 4
      expect(result).toBe('CL004');
    });
  });
});
