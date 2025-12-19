import React, { useId } from 'react';
import { classNames } from '@/utils/classNames';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export default function Input({
  label,
  error,
  helperText,
  required = false,
  className = '',
  value,
  id,
  ...props
}: InputProps) {
  // ✅ FIXED: useId()로 고정 ID 생성 (label 연결용)
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const inputClasses = error ? classNames.inputError : classNames.input;

  // Fix controlled/uncontrolled input warning: convert undefined to empty string
  const controlledValue = value === undefined || value === null ? '' : value;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className={classNames.formLabel}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <input
        id={inputId}
        className={`${inputClasses} ${className}`}
        value={controlledValue}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        {...props}
      />

      {error && (
        <p id={errorId} className={classNames.formError} role="alert">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p id={helperId} className="text-xs text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}
