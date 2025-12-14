import {
  validateField,
  validateForm,
  commonRules,
  clientValidation,
  instrumentValidation,
  connectionValidation,
  validateAsync,
  useFormValidation,
  useDebouncedValidation,
} from '../validationUtils';
import { renderHook, act, waitFor } from '@/test-utils/render';

describe('validationUtils', () => {
  describe('commonRules', () => {
    it('should create required rule', () => {
      const rule = commonRules.required('Custom message');
      expect(rule.required).toBe(true);
      expect(rule.message).toBe('Custom message');
    });

    it('should create email rule', () => {
      const rule = commonRules.email();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('test@example.com')).toBe(true);
      expect(rule.pattern?.test('invalid-email')).toBe(false);
    });

    it('should create phone rule', () => {
      const rule = commonRules.phone();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('1234567890')).toBe(true);
      expect(rule.pattern?.test('+1234567890')).toBe(true);
      expect(rule.pattern?.test('abc')).toBe(false);
    });

    it('should create minLength rule', () => {
      const rule = commonRules.minLength(5);
      expect(rule.minLength).toBe(5);
      expect(rule.message).toContain('5');
    });

    it('should create maxLength rule', () => {
      const rule = commonRules.maxLength(10);
      expect(rule.maxLength).toBe(10);
      expect(rule.message).toContain('10');
    });

    it('should create numeric rule', () => {
      const rule = commonRules.numeric();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('123')).toBe(true);
      expect(rule.pattern?.test('12.5')).toBe(false);
      expect(rule.pattern?.test('abc')).toBe(false);
    });

    it('should create decimal rule', () => {
      const rule = commonRules.decimal();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('123')).toBe(true);
      expect(rule.pattern?.test('12.5')).toBe(true);
      expect(rule.pattern?.test('abc')).toBe(false);
    });

    it('should create year rule', () => {
      const rule = commonRules.year();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('2024')).toBe(true);
      expect(rule.pattern?.test('1999')).toBe(true);
      expect(rule.pattern?.test('1899')).toBe(false);
      expect(rule.pattern?.test('2100')).toBe(false);
    });

    it('should create url rule', () => {
      const rule = commonRules.url();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.pattern?.test('https://example.com')).toBe(true);
      expect(rule.pattern?.test('http://example.com')).toBe(true);
      expect(rule.pattern?.test('example.com')).toBe(false);
    });
  });

  describe('validateField', () => {
    it('should validate required field', () => {
      const error = validateField('', [commonRules.required()], 'Field');
      expect(error).toBe('This field is required');

      const noError = validateField('value', [commonRules.required()], 'Field');
      expect(noError).toBeNull();
    });

    it('should validate minLength', () => {
      const error = validateField('ab', [commonRules.minLength(5)], 'Field');
      expect(error).toContain('at least 5');

      const noError = validateField(
        'abcde',
        [commonRules.minLength(5)],
        'Field'
      );
      expect(noError).toBeNull();
    });

    it('should validate maxLength', () => {
      const error = validateField(
        'abcdefghijk',
        [commonRules.maxLength(10)],
        'Field'
      );
      expect(error).toContain('no more than 10');

      const noError = validateField(
        'abcde',
        [commonRules.maxLength(10)],
        'Field'
      );
      expect(noError).toBeNull();
    });

    it('should validate pattern', () => {
      const error = validateField(
        'invalid-email',
        [commonRules.email()],
        'Field'
      );
      expect(error).toBe('Please enter a valid email address');

      const noError = validateField(
        'test@example.com',
        [commonRules.email()],
        'Field'
      );
      expect(noError).toBeNull();
    });

    it('should validate custom rule', () => {
      const customRule = {
        custom: (value: string) => {
          if (value === 'forbidden') {
            return 'This value is forbidden';
          }
          return null;
        },
      };

      const error = validateField('forbidden', [customRule], 'Field');
      expect(error).toBe('This value is forbidden');

      const noError = validateField('allowed', [customRule], 'Field');
      expect(noError).toBeNull();
    });

    it('should skip validation for empty non-required fields', () => {
      const error = validateField('', [commonRules.email()], 'Field');
      expect(error).toBeNull(); // Empty value should not trigger email validation
    });

    it('should validate multiple rules', () => {
      const rules = [
        commonRules.required(),
        commonRules.minLength(5),
        commonRules.email(),
      ];

      const error1 = validateField('', rules, 'Field');
      expect(error1).toBe('This field is required');

      const error2 = validateField('ab', rules, 'Field');
      expect(error2).toContain('at least 5');

      const error3 = validateField('invalid', rules, 'Field');
      expect(error3).toBe('Please enter a valid email address');

      const noError = validateField('test@example.com', rules, 'Field');
      expect(noError).toBeNull();
    });

    it('should handle whitespace in required fields', () => {
      const error = validateField('   ', [commonRules.required()], 'Field');
      expect(error).toBe('This field is required');
    });

    it('should handle null and undefined values', () => {
      const error1 = validateField(null, [commonRules.required()], 'Field');
      expect(error1).toBe('This field is required');

      const error2 = validateField(
        undefined,
        [commonRules.required()],
        'Field'
      );
      expect(error2).toBe('This field is required');
    });
  });

  describe('validateForm', () => {
    it('should validate entire form', () => {
      const schema = {
        name: [commonRules.required(), commonRules.minLength(2)],
        email: [commonRules.required(), commonRules.email()],
      };

      const result1 = validateForm(
        {
          name: '',
          email: '',
        },
        schema
      );

      expect(result1.isValid).toBe(false);
      expect(result1.errors.name).toBeDefined();
      expect(result1.errors.email).toBeDefined();

      const result2 = validateForm(
        {
          name: 'John',
          email: 'john@example.com',
        },
        schema
      );

      expect(result2.isValid).toBe(true);
      expect(Object.keys(result2.errors)).toHaveLength(0);
    });

    it('should validate partial form', () => {
      const schema = {
        name: [commonRules.required()],
        email: [commonRules.email()], // Not required
      };

      const result = validateForm(
        {
          name: 'John',
          email: '',
        },
        schema
      );

      expect(result.isValid).toBe(true);
    });

    it('should validate form with custom rules', () => {
      const schema = {
        price: [
          {
            custom: (value: string) => {
              if (!value) return null;
              const num = parseFloat(value);
              if (isNaN(num)) return 'Price must be a valid number';
              if (num < 0) return 'Price cannot be negative';
              return null;
            },
          },
        ],
      };

      const result1 = validateForm({ price: '-100' }, schema);
      expect(result1.isValid).toBe(false);
      expect(result1.errors.price).toBe('Price cannot be negative');

      const result2 = validateForm({ price: '100' }, schema);
      expect(result2.isValid).toBe(true);
    });
  });

  describe('clientValidation', () => {
    it('should validate firstName', () => {
      const error1 = validateField('', clientValidation.firstName, 'firstName');
      expect(error1).toBe('First name is required');

      const error2 = validateField(
        'A',
        clientValidation.firstName,
        'firstName'
      );
      expect(error2).toContain('at least 2');

      const noError = validateField(
        'John',
        clientValidation.firstName,
        'firstName'
      );
      expect(noError).toBeNull();
    });

    it('should validate lastName', () => {
      const error1 = validateField('', clientValidation.lastName, 'lastName');
      expect(error1).toBe('Last name is required');

      const noError = validateField(
        'Doe',
        clientValidation.lastName,
        'lastName'
      );
      expect(noError).toBeNull();
    });

    it('should validate email', () => {
      const error1 = validateField('', clientValidation.email, 'email');
      expect(error1).toBe('Email is required');

      const error2 = validateField('invalid', clientValidation.email, 'email');
      expect(error2).toBe('Please enter a valid email address');

      const noError = validateField(
        'test@example.com',
        clientValidation.email,
        'email'
      );
      expect(noError).toBeNull();
    });

    it('should validate phone', () => {
      const error = validateField('abc', clientValidation.phone, 'phone');
      expect(error).toBe('Please enter a valid phone number');

      const noError = validateField(
        '1234567890',
        clientValidation.phone,
        'phone'
      );
      expect(noError).toBeNull();
    });

    it('should validate address', () => {
      const error = validateField('123', clientValidation.address, 'address');
      expect(error).toBe('Please enter a complete address');

      const noError = validateField(
        '123 Main St',
        clientValidation.address,
        'address'
      );
      expect(noError).toBeNull();
    });
  });

  describe('instrumentValidation', () => {
    it('should validate maker', () => {
      const error1 = validateField('', instrumentValidation.maker, 'maker');
      expect(error1).toBe('Maker is required');

      const noError = validateField(
        'Stradivarius',
        instrumentValidation.maker,
        'maker'
      );
      expect(noError).toBeNull();
    });

    it('should validate name', () => {
      const error1 = validateField('', instrumentValidation.name, 'name');
      expect(error1).toBe('Instrument name is required');

      const noError = validateField(
        'Violin',
        instrumentValidation.name,
        'name'
      );
      expect(noError).toBeNull();
    });

    it('should validate year', () => {
      const error1 = validateField('', instrumentValidation.year, 'year');
      expect(error1).toBe('Year is required');

      const error2 = validateField('1899', instrumentValidation.year, 'year');
      expect(error2).toBe('Please enter a valid year (1900-2099)');

      const noError = validateField('2024', instrumentValidation.year, 'year');
      expect(noError).toBeNull();
    });

    it('should validate price', () => {
      const error1 = validateField(
        'invalid',
        instrumentValidation.price,
        'price'
      );
      expect(error1).toBe('Please enter a valid price');

      // '-100'은 decimal 패턴에 맞지 않으므로 decimal 규칙에서 실패
      // decimal 규칙: /^\d+(\.\d+)?$/ (음수 허용 안 함)
      const error2 = validateField('-100', instrumentValidation.price, 'price');
      expect(error2).toBe('Please enter a valid price'); // decimal 규칙에서 실패

      // 유효한 decimal이지만 범위를 초과하는 경우
      const error3 = validateField(
        '2000000',
        instrumentValidation.price,
        'price'
      );
      expect(error3).toBe('Price seems too high');

      // 유효한 decimal이고 범위 내인 경우
      const noError = validateField(
        '1000',
        instrumentValidation.price,
        'price'
      );
      expect(noError).toBeNull();
    });
  });

  describe('connectionValidation', () => {
    it('should validate notes', () => {
      const longNotes = 'a'.repeat(501);
      const error = validateField(
        longNotes,
        connectionValidation.notes,
        'notes'
      );
      expect(error).toContain('500 characters');

      const noError = validateField(
        'Short note',
        connectionValidation.notes,
        'notes'
      );
      expect(noError).toBeNull();
    });

    it('should validate relationshipType', () => {
      const error = validateField(
        '',
        connectionValidation.relationshipType,
        'relationshipType'
      );
      expect(error).toBe('Relationship type is required');

      const noError = validateField(
        'Sold',
        connectionValidation.relationshipType,
        'relationshipType'
      );
      expect(noError).toBeNull();
    });
  });

  describe('validateAsync', () => {
    it('should validate async', async () => {
      const asyncValidator = async (value: string) => {
        if (value === 'invalid') {
          return 'This value is invalid';
        }
        return null;
      };

      const error = await validateAsync('invalid', asyncValidator);
      expect(error).toBe('This value is invalid');

      const noError = await validateAsync('valid', asyncValidator);
      expect(noError).toBeNull();
    });

    it('should handle async validation errors', async () => {
      const asyncValidator = async () => {
        throw new Error('Validation failed');
      };

      const error = await validateAsync('value', asyncValidator);
      expect(error).toBe('Validation failed');
    });
  });

  describe('useFormValidation', () => {
    it('should validate field', () => {
      const schema = {
        name: [commonRules.required(), commonRules.minLength(2)],
        email: [commonRules.required(), commonRules.email()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
            email: '',
          },
          schema
        )
      );

      act(() => {
        result.current.validateField('name', '');
      });

      // commonRules.required()의 기본 메시지 사용
      expect(result.current.errors.name).toBe('This field is required');
    });

    it('should validate form', () => {
      const schema = {
        name: [commonRules.required()],
        email: [commonRules.required(), commonRules.email()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
            email: 'invalid',
          },
          schema
        )
      );

      act(() => {
        const validationResult = result.current.validateForm();
        expect(validationResult.isValid).toBe(false);
        expect(validationResult.errors.name).toBeDefined();
        expect(validationResult.errors.email).toBeDefined();
      });
    });

    it('should set field touched', () => {
      const schema = {
        name: [commonRules.required()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
          },
          schema
        )
      );

      act(() => {
        result.current.setFieldTouched('name', true);
      });

      expect(result.current.touched.name).toBe(true);
    });

    it('should clear errors', () => {
      const schema = {
        name: [commonRules.required()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
          },
          schema
        )
      );

      act(() => {
        const error = result.current.validateField('name', '');
        expect(error).toBeTruthy();
      });

      // Wait for state update
      expect(result.current.errors.name).toBeTruthy();

      act(() => {
        result.current.clearErrors();
      });

      // clearErrors()는 빈 객체를 설정하므로 errors.name은 undefined가 됨
      expect(result.current.errors.name).toBeUndefined();
      expect(Object.keys(result.current.errors)).toHaveLength(0);
    });

    it('should check hasErrors', () => {
      const schema = {
        name: [commonRules.required()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
          },
          schema
        )
      );

      act(() => {
        result.current.validateField('name', '');
      });

      expect(result.current.hasErrors).toBe(true);
    });

    it('should check isTouched', () => {
      const schema = {
        name: [commonRules.required()],
      };

      const { result } = renderHook(() =>
        useFormValidation(
          {
            name: '',
          },
          schema
        )
      );

      act(() => {
        result.current.setFieldTouched('name', true);
      });

      expect(result.current.isTouched).toBe(true);
    });
  });

  describe('useDebouncedValidation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should debounce validation', async () => {
      const validator = (value: string) => {
        if (value.length < 5) {
          return 'Too short';
        }
        return null;
      };

      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValidation(value, validator, 300),
        {
          initialProps: { value: 'ab' },
        }
      );

      expect(result.current.isValidating).toBe(false);

      rerender({ value: 'abc' });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Too short');
        expect(result.current.isValidating).toBe(false);
      });
    });

    it('should clear error on valid input', async () => {
      const validator = (value: string) => {
        if (value.length < 5) {
          return 'Too short';
        }
        return null;
      };

      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValidation(value, validator, 300),
        {
          initialProps: { value: 'ab' },
        }
      );

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Too short');
      });

      rerender({ value: 'abcdef' });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });
  });
});
