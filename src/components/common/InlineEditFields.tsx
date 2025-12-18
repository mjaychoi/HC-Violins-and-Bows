/**
 * 공통 인라인 편집 필드 컴포넌트
 * 자주 사용하는 인라인 편집 필드들을 재사용 가능한 컴포넌트로 제공
 */

'use client';

import React from 'react';
import { cn } from '@/utils/classNames';

// ============================================================================
// 기본 인라인 필드 컴포넌트
// ============================================================================

interface BaseInlineFieldProps {
  /**
   * 편집 모드인지 여부
   */
  isEditing: boolean;
  /**
   * 저장 중인지 여부
   */
  isSaving?: boolean;
  /**
   * 추가 클래스명
   */
  className?: string;
  /**
   * 클릭 이벤트 핸들러 (편집 모드 전환용)
   */
  onClick?: () => void;
  /**
   * 편집 모드에서의 추가 클래스명
   */
  editingClassName?: string;
  /**
   * 보기 모드에서의 추가 클래스명
   */
  viewClassName?: string;
  /**
   * Enter 키 핸들러 (저장용, 선택사항)
   */
  onEnter?: () => void;
  /**
   * Escape 키 핸들러 (취소용, 선택사항)
   */
  onEscape?: () => void;
}

/**
 * 텍스트 필드 인라인 편집
 */
export interface InlineTextFieldProps extends BaseInlineFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
  disabled?: boolean;
}

export function InlineTextField({
  isEditing,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  className = '',
  onClick,
  editingClassName = '',
  viewClassName = '',
  onEnter,
  onEscape,
}: InlineTextFieldProps) {
  if (isEditing) {
    return (
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          editingClassName,
          className
        )}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onEnter?.();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onEscape?.();
          }
        }}
      />
    );
  }

  return (
    <span
      className={cn(
        'text-sm text-gray-900 cursor-pointer hover:text-blue-600 transition-colors',
        viewClassName,
        className
      )}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Click to edit"
    >
      {value || <span className="text-gray-400">—</span>}
    </span>
  );
}

/**
 * 숫자 필드 인라인 편집
 */
export interface InlineNumberFieldProps extends BaseInlineFieldProps {
  value: number | string | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /**
   * 포맷 함수 (보기 모드에서 표시할 때 사용)
   */
  format?: (value: number | null) => string;
}

export function InlineNumberField({
  isEditing,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  disabled = false,
  format,
  className = '',
  onClick,
  editingClassName = '',
  viewClassName = '',
  onEnter,
  onEscape,
}: InlineNumberFieldProps) {
  const displayValue = typeof value === 'number' ? value : value || '';

  if (isEditing) {
    return (
      <input
        type="number"
        value={displayValue}
        onChange={e => {
          const numValue =
            e.target.value === '' ? null : parseFloat(e.target.value);
          onChange(numValue === null || isNaN(numValue) ? null : numValue);
        }}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={cn(
          'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          editingClassName,
          className
        )}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onEnter?.();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onEscape?.();
          }
        }}
      />
    );
  }

  const formattedValue = format
    ? format(typeof value === 'number' ? value : null)
    : typeof value === 'number'
      ? value.toString()
      : '—';

  return (
    <span
      className={cn(
        'text-sm text-gray-900 cursor-pointer hover:text-blue-600 transition-colors',
        viewClassName,
        className
      )}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Click to edit"
    >
      {formattedValue}
    </span>
  );
}

/**
 * 선택 필드 인라인 편집
 */
export interface InlineSelectFieldProps<
  T extends string = string,
> extends BaseInlineFieldProps {
  value: T | null;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}

export function InlineSelectField<T extends string = string>({
  isEditing,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  onClick,
  editingClassName = '',
  viewClassName = '',
}: InlineSelectFieldProps<T>) {
  if (isEditing) {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value as T)}
        disabled={disabled}
        className={cn(
          'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white',
          editingClassName,
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption?.label || value || '—';

  return (
    <span
      className={cn(
        'text-sm text-gray-900 cursor-pointer hover:text-blue-600 transition-colors',
        viewClassName,
        className
      )}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Click to edit"
    >
      {displayValue}
    </span>
  );
}

/**
 * 불리언 필드 인라인 편집 (체크박스 또는 토글)
 */
export interface InlineBooleanFieldProps extends BaseInlineFieldProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
  disabled?: boolean;
}

export function InlineBooleanField({
  isEditing,
  value,
  onChange,
  trueLabel = 'Yes',
  falseLabel = 'No',
  disabled = false,
  className = '',
  onClick,
  editingClassName = '',
  viewClassName = '',
}: InlineBooleanFieldProps) {
  if (isEditing) {
    return (
      <select
        value={value === null ? '' : String(value)}
        onChange={e => onChange(e.target.value === 'true')}
        disabled={disabled}
        className={cn(
          'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white',
          editingClassName,
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        <option value="true">{trueLabel}</option>
        <option value="false">{falseLabel}</option>
      </select>
    );
  }

  const displayValue = value === null ? '—' : value ? trueLabel : falseLabel;

  return (
    <span
      className={cn(
        'text-sm text-gray-900 cursor-pointer hover:text-blue-600 transition-colors',
        viewClassName,
        className
      )}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Click to edit"
    >
      {displayValue}
    </span>
  );
}

// ============================================================================
// 편집 아이콘 버튼 컴포넌트
// ============================================================================

interface InlineEditButtonProps {
  /**
   * 클릭 핸들러
   */
  onClick: () => void;
  /**
   * 버튼 라벨 (접근성용)
   */
  'aria-label': string;
  /**
   * 추가 클래스명
   */
  className?: string;
  /**
   * 버튼 크기
   * @default "sm"
   */
  size?: 'xs' | 'sm' | 'md';
}

/**
 * 인라인 편집 시작 버튼 (편집 아이콘)
 */
export function InlineEditButton({
  onClick,
  'aria-label': ariaLabel,
  className = '',
  size = 'sm',
}: InlineEditButtonProps) {
  const sizeClasses = {
    xs: 'w-3 h-3 p-0.5',
    sm: 'w-4 h-4 p-1',
    md: 'w-5 h-5 p-1.5',
  };

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center justify-center text-gray-400 hover:text-blue-600 transition-all duration-200 hover:scale-110 rounded',
        sizeClasses[size],
        className
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <svg
        className="w-full h-full"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
  );
}

// ============================================================================
// 편집 액션 버튼 컴포넌트
// ============================================================================

interface InlineEditActionsProps {
  /**
   * 저장 중인지 여부
   */
  isSaving: boolean;
  /**
   * 저장 핸들러
   */
  onSave: () => void;
  /**
   * 취소 핸들러
   */
  onCancel: () => void;
  /**
   * 저장 버튼 텍스트
   * @default "Save"
   */
  saveLabel?: string;
  /**
   * 취소 버튼 텍스트
   * @default "Cancel"
   */
  cancelLabel?: string;
  /**
   * 추가 클래스명
   */
  className?: string;
}

/**
 * 인라인 편집 액션 버튼 (저장/취소)
 */
export function InlineEditActions({
  isSaving,
  onSave,
  onCancel,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  className = '',
}: InlineEditActionsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={e => {
          e.stopPropagation();
          onSave();
        }}
        disabled={isSaving}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Save changes (Enter)"
        aria-label="Save changes"
      >
        {isSaving ? (
          <>
            <svg
              className="w-3 h-3 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Saving...</span>
          </>
        ) : (
          <>
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>{saveLabel}</span>
          </>
        )}
      </button>
      <button
        onClick={e => {
          e.stopPropagation();
          onCancel();
        }}
        disabled={isSaving}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Cancel editing (Escape)"
        aria-label="Cancel editing"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <span>{cancelLabel}</span>
      </button>
    </div>
  );
}
