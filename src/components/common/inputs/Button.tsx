import React from 'react';

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
  // ✅ FIXED: Button variant styles (colorTokens 기반으로 직접 정의)
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary:
      'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    warning:
      'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500',
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
      aria-disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center">
          {/* ✅ FIXED: border-current로 variant 색상에 맞게 자동 조정 */}
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
          {showLoadingText ? (
            'Loading...'
          ) : (
            // ✅ FIXED: 기존 children 유지 + 스피너 옆에 배치 (레이아웃 점프 방지)
            <>
              <span className="sr-only">Loading</span>
              {children}
            </>
          )}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
