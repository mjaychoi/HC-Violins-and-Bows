// src/hooks/useFormState.ts
import { useState, useCallback, useRef, useEffect } from 'react';

// Generic form state management hook
export function useFormState<T extends Record<string, unknown>>(
  initialState: T
) {
  const initialRef = useRef(initialState);

  useEffect(() => {
    initialRef.current = initialState;
  }, [initialState]);

  const [formData, setFormData] = useState<T>(initialRef.current);
  // FIXED: Type now allows undefined (which we set when clearing errors)
  const [errors, setErrors] = useState<
    Partial<Record<keyof T, string | undefined>>
  >({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  // FIXED: Removed errors from deps and use functional update to avoid stale closure
  // This prevents unnecessary re-renders and stale error state issues
  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      // Clear error when user starts typing using functional update
      setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
    },
    [] // No deps needed - using functional updates
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
    setFormData(initialRef.current);
    setErrors({});
    setTouched({});
  }, []);

  const hasErrors = Object.values(errors).some(
    (error): error is string => error !== undefined
  );
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
