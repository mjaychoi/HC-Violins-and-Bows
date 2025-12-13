// Validation utility functions for form validation
import { useState, useCallback, useEffect } from 'react';

export interface ValidationRule<T = unknown> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Common validation rules
export const commonRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    required: true,
    message,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message,
  }),

  phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
    pattern: /^[\+]?[1-9][\d]{0,15}$/,
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    minLength: min,
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    maxLength: max,
    message: message || `Must be no more than ${max} characters`,
  }),

  numeric: (message = 'Must be a valid number'): ValidationRule => ({
    pattern: /^\d+$/,
    message,
  }),

  decimal: (message = 'Must be a valid decimal number'): ValidationRule => ({
    pattern: /^\d+(\.\d+)?$/,
    message,
  }),

  year: (message = 'Please enter a valid year'): ValidationRule => ({
    pattern: /^(19|20)\d{2}$/,
    message,
  }),

  url: (message = 'Please enter a valid URL'): ValidationRule => ({
    pattern: /^https?:\/\/.+/,
    message,
  }),
};

// Validate a single field
export function validateField<T>(
  value: T,
  rules: ValidationRule<T>[],
  fieldName: string
): string | null {
  // Helper to check if value is empty (handles 0, false correctly)
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');

  for (const rule of rules) {
    // Required check
    if (rule.required && isEmpty) {
      return rule.message || `${fieldName} is required`;
    }

    // Skip other validations if value is empty and not required
    // (0 and false are considered valid non-empty values)
    if (isEmpty) continue;

    const stringValue = String(value);

    // Min length check
    if (rule.minLength && stringValue.length < rule.minLength) {
      return (
        rule.message ||
        `${fieldName} must be at least ${rule.minLength} characters`
      );
    }

    // Max length check
    if (rule.maxLength && stringValue.length > rule.maxLength) {
      return (
        rule.message ||
        `${fieldName} must be no more than ${rule.maxLength} characters`
      );
    }

    // Pattern check
    if (rule.pattern && !rule.pattern.test(stringValue)) {
      return rule.message || `${fieldName} format is invalid`;
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value);
      if (customError) {
        return customError;
      }
    }
  }

  return null;
}

// Validate an entire form
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validationSchema: Partial<Record<keyof T, ValidationRule<T[keyof T]>[]>>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [fieldName, rules] of Object.entries(validationSchema)) {
    const value = data[fieldName as keyof T];
    const error = validateField(value, rules as ValidationRule[], fieldName);

    if (error) {
      errors[fieldName] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Specific validation functions for common use cases
export const clientValidation = {
  firstName: [
    commonRules.required('First name is required'),
    commonRules.minLength(2),
  ],
  lastName: [
    commonRules.required('Last name is required'),
    commonRules.minLength(2),
  ],
  email: [commonRules.required('Email is required'), commonRules.email()],
  phone: [commonRules.phone()],
  address: [commonRules.minLength(5, 'Please enter a complete address')],
};

export const instrumentValidation = {
  maker: [commonRules.required('Maker is required'), commonRules.minLength(2)],
  name: [
    commonRules.required('Instrument name is required'),
    commonRules.minLength(2),
  ],
  year: [
    commonRules.required('Year is required'),
    commonRules.year('Please enter a valid year (1900-2099)'),
  ],
  price: [
    commonRules.decimal('Please enter a valid price'),
    {
      custom: (value: string) => {
        const num = parseFloat(value);
        if (num < 0) return 'Price cannot be negative';
        if (num > 1000000) return 'Price seems too high';
        return null;
      },
    },
  ],
};

export const connectionValidation = {
  notes: [commonRules.maxLength(500, 'Notes cannot exceed 500 characters')],
  relationshipType: [commonRules.required('Relationship type is required')],
};

// Form validation hooks
/**
 * Hook for form validation
 * @param data - Current form data (should be updated on each change)
 * @param validationSchema - Validation rules for each field
 * 
 * NOTE: data should be the current form state, not just initial data.
 * Pass the updated form data on each render to ensure validation uses current values.
 */
export function useFormValidation<T extends Record<string, unknown>>(
  data: T,
  validationSchema: Record<keyof T, ValidationRule<T[keyof T]>[]>
) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateFieldHook = useCallback(
    (fieldName: keyof T, value: T[keyof T]) => {
      const rules = validationSchema[fieldName] || [];
      const error = validateField(value, rules, String(fieldName));

      setErrors(prev => ({
        ...prev,
        [fieldName]: error || '',
      }));

      return error;
    },
    [validationSchema]
  );

  // FIXED: Now uses current data instead of initialData
  const validateFormHook = useCallback(() => {
    const result = validateForm(data, validationSchema);
    setErrors(result.errors);
    return result;
  }, [data, validationSchema]);

  const setFieldTouched = useCallback(
    (fieldName: keyof T, isTouched = true) => {
      setTouched(prev => ({
        ...prev,
        [fieldName]: isTouched,
      }));
    },
    []
  );

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const hasErrors = Object.values(errors).some(error => error !== '');
  const isTouched = Object.values(touched).some(touched => touched);

  return {
    errors,
    touched,
    validateField: validateFieldHook,
    validateForm: validateFormHook,
    setFieldTouched,
    clearErrors,
    hasErrors,
    isTouched,
  };
}

// Async validation utilities
export async function validateAsync<T>(
  value: T,
  asyncValidator: (value: T) => Promise<string | null>
): Promise<string | null> {
  try {
    return await asyncValidator(value);
  } catch {
    return 'Validation failed';
  }
}

// Debounced validation
export function useDebouncedValidation<T>(
  value: T,
  validator: (value: T) => string | null,
  delay: number = 300
) {
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsValidating(true);
      const result = validator(value);
      setError(result);
      setIsValidating(false);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, validator, delay]);

  return { error, isValidating };
}
