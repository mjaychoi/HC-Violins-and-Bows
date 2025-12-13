import React from 'react';
import { classNames } from '@/utils/classNames';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: classNames.buttonPrimary,
    secondary: classNames.buttonSecondary,
    danger: classNames.buttonDanger,
    success: classNames.buttonSuccess,
    warning: classNames.buttonWarning,
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const baseClasses =
    'rounded-md focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <button
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${baseClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Loading...
        </div>
      ) : (
        children
      )}
    </button>
  );
}
