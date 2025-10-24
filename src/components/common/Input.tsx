import React from 'react'
import { classNames } from '@/utils/classNames'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
}

export default function Input({ 
  label, 
  error, 
  helperText, 
  required = false,
  className = '',
  ...props 
}: InputProps) {
  const inputClasses = error ? classNames.inputError : classNames.input

  return (
    <div className="space-y-1">
      {label && (
        <label className={classNames.formLabel}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        className={`${inputClasses} ${className}`}
        {...props}
      />
      
      {error && (
        <p className={classNames.formError}>{error}</p>
      )}
      
      {helperText && !error && (
        <p className="text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  )
}
