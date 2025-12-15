import React from 'react';
import { classNames } from '@/utils/classNames';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
  /**
   * 로딩 중 UI에 "Loading..." 텍스트 표시 여부 (기본: false, sr-only)
   */
  showLoadingText?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  showLoadingText = false,
  type = 'button', // ✅ FIXED: 기본 type="button" (submit 사고 방지)
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
      type={type}
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${baseClasses} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center">
          {/* ✅ FIXED: border-current로 variant 색상에 맞게 자동 조정 */}
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
          {showLoadingText ? (
            'Loading...'
          ) : (
            // ✅ FIXED: 화면리더에만 읽히게 (UI에 텍스트 없음)
            <span className="sr-only">Loading</span>
          )}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
