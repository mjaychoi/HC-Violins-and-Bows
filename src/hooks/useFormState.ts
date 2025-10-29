// src/hooks/useFormState.ts
import { useState, useCallback } from 'react';

// Generic form state management hook
export function useFormState<T extends Record<string, unknown>>(
  initialState: T
) {
  const [formData, setFormData] = useState<T>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      // Clear error when user starts typing
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  const updateFields = useCallback((updates: Partial<T>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const setFieldError = useCallback(
    <K extends keyof T>(field: K, error: string) => {
      setErrors(prev => ({ ...prev, [field]: error }));
    },
    []
  );

  const setFieldTouched = useCallback(
    <K extends keyof T>(field: K, touched: boolean) => {
      setTouched(prev => ({ ...prev, [field]: touched }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setFormData(initialState);
    setErrors({});
    setTouched({});
  }, [initialState]);

  const hasErrors = Object.values(errors).some(error => error !== undefined);
  const isTouched = Object.values(touched).some(t => t === true);

  return {
    formData,
    errors,
    touched,
    updateField,
    updateFields,
    setFieldError,
    setFieldTouched,
    resetForm,
    hasErrors,
    isTouched,
    setFormData,
    setErrors,
    setTouched,
  };
}
