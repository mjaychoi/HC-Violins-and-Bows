import React from 'react';
import { cn } from '@/utils/classNames';

export interface PillSelectOption {
  value: string;
  label: string;
}

interface PillSelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange'
> {
  value: string;
  onChange: (value: string) => void;
  options: PillSelectOption[];
  wrapperClassName?: string;
  /**
   * 기본 옵션 추가 여부 (All / None)
   * 'all': "All" 옵션 추가 (value="")
   * 'none': "None" 옵션 추가 (value="")
   * false: 기본 옵션 없음
   */
  defaultOption?: 'all' | 'none' | false;
}

export default function PillSelect({
  value,
  onChange,
  options,
  className,
  wrapperClassName,
  defaultOption = false,
  ...rest
}: PillSelectProps) {
  // ✅ FIXED: 기본 옵션 지원 (All / None)
  const defaultOptions: PillSelectOption[] = [];
  if (defaultOption === 'all') {
    defaultOptions.push({ value: '', label: 'All' });
  } else if (defaultOption === 'none') {
    defaultOptions.push({ value: '', label: 'None' });
  }

  const allOptions = [...defaultOptions, ...options];

  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'h-8 appearance-none rounded-full border border-gray-200 bg-white px-3 pr-7 text-xs text-gray-700 transition hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          className
        )}
        {...rest}
      >
        {allOptions.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <svg
          className="h-3 w-3 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}
