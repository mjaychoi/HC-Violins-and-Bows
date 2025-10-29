'use client';

import React, { ReactNode } from 'react';
import { useFormState } from '@/hooks/useFormState';

interface FormWrapperProps<T extends Record<string, unknown>> {
  initialData: T;
  onSubmit: (data: T) => Promise<void> | void;
  children: (formState: {
    formData: T;
    errors: Partial<Record<keyof T, string>>;
    touched: Partial<Record<keyof T, boolean>>;
    updateField: <K extends keyof T>(field: K, value: T[K]) => void;
    updateFields: (updates: Partial<T>) => void;
    setFieldError: <K extends keyof T>(field: K, error: string) => void;
    setFieldTouched: <K extends keyof T>(field: K, touched: boolean) => void;
    resetForm: () => void;
    hasErrors: boolean;
    isTouched: boolean;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    submitting?: boolean;
  }) => ReactNode;
  className?: string;
  validate?: (data: T) => Partial<Record<keyof T, string>>;
  submitting?: boolean;
}

export default function FormWrapper<T extends Record<string, unknown>>({
  initialData,
  onSubmit,
  children,
  className = '',
  validate,
  submitting = false,
}: FormWrapperProps<T>) {
  const {
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
  } = useFormState(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form if validation function provided
    if (validate) {
      const validationErrors = validate(formData);
      if (Object.keys(validationErrors).length > 0) {
        Object.entries(validationErrors).forEach(([field, error]) => {
          if (error) {
            setFieldError(field as keyof T, error);
          }
        });
        return;
      }
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return (
    <form className={className} onSubmit={handleSubmit}>
      {children({
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
        handleSubmit,
        submitting,
      })}
    </form>
  );
}

// 특화된 폼 래퍼들
interface SimpleFormWrapperProps<T extends Record<string, unknown>> {
  initialData: T;
  onSubmit: (data: T) => Promise<void> | void;
  children: ReactNode;
  className?: string;
  validate?: (data: T) => Partial<Record<keyof T, string>>;
  submitting?: boolean;
}

export function SimpleFormWrapper<T extends Record<string, unknown>>({
  initialData,
  onSubmit,
  children,
  className = '',
  validate,
  submitting = false,
}: SimpleFormWrapperProps<T>) {
  return (
    <FormWrapper
      initialData={initialData}
      onSubmit={onSubmit}
      className={className}
      validate={validate}
      submitting={submitting}
    >
      {() => children}
    </FormWrapper>
  );
}
