'use client';

import React from 'react';
import { cn } from '@/utils/classNames';

interface MobileCardViewProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 모바일에서 카드 뷰로 표시하는 래퍼 컴포넌트
 * 데스크톱에서는 숨기고, 모바일에서만 표시
 */
export default function MobileCardView({
  children,
  className = '',
}: MobileCardViewProps) {
  return <div className={cn('block md:hidden', className)}>{children}</div>;
}

interface MobileCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * 개별 모바일 카드 컴포넌트
 */
export function MobileCard({
  children,
  onClick,
  className = '',
}: MobileCardProps) {
  const baseClasses =
    'bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-3';
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:shadow-md transition-shadow'
    : '';

  return (
    <div
      className={cn(baseClasses, interactiveClasses, className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface MobileCardRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

/**
 * 모바일 카드 내부의 행 컴포넌트 (라벨: 값 형태)
 */
export function MobileCardRow({
  label,
  value,
  className = '',
  labelClassName = '',
  valueClassName = '',
}: MobileCardRowProps) {
  return (
    <div className={cn('flex justify-between items-start py-2', className)}>
      <span
        className={cn(
          'text-xs font-medium text-gray-500 flex-shrink-0 mr-2',
          labelClassName
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'text-sm text-gray-900 text-right flex-1',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
