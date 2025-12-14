'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void; // 즉시 UI 업데이트
  /**
   * Debounced onChange - 실제 검색 트리거 (필터/URL sync/API)
   * 제공되지 않으면 onChange만 사용 (기존 동작)
   */
  onDebouncedChange?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  showClearButton?: boolean;
  showSearchIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'filled';
  disabled?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onClear?: () => void;
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void;
  showSuggestions?: boolean;
  maxSuggestions?: number;
}

export default function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  placeholder = 'Search...',
  debounceMs = 200,
  className = '',
  showClearButton = true,
  showSearchIcon = true,
  size = 'md',
  variant = 'default',
  disabled = false,
  autoFocus = false,
  onFocus,
  onBlur,
  onClear,
  suggestions = [],
  onSuggestionSelect,
  showSuggestions = false,
  maxSuggestions = 5,
}: SearchInputProps) {
  const [, setIsFocused] = useState(false);
  const [showSuggestionsList, setShowSuggestionsList] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // ✅ FIXED: debounced onChange를 옵션으로 분리
  const debouncedValue = useDebounce(value, debounceMs);

  // ✅ FIXED: onDebouncedChange가 제공되면 debounced 값으로 호출
  useEffect(() => {
    onDebouncedChange?.(debouncedValue);
  }, [debouncedValue, onDebouncedChange]);

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  // Variant classes
  const variantClasses = {
    default: 'border border-gray-300 bg-white',
    outlined: 'border-2 border-gray-300 bg-transparent',
    filled: 'border-0 bg-gray-100',
  };

  const baseClasses = `
    w-full rounded-md transition-colors duration-200
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${className}
  `.trim();

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setSelectedSuggestionIndex(-1);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  }, [onChange, onClear]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestionsList(showSuggestions && suggestions.length > 0);
    onFocus?.();
  }, [showSuggestions, suggestions.length, onFocus]);

  // ✅ FIXED: outside click으로 suggestions 닫기 (더 안전)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestionsList(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    if (showSuggestionsList) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSuggestionsList]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding suggestions to allow for clicks (키보드 탐색 후 Enter 등)
    setTimeout(() => {
      setShowSuggestionsList(false);
      setSelectedSuggestionIndex(-1);
    }, 150);
    onBlur?.();
  }, [onBlur]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestionsList || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedSuggestionIndex >= 0) {
            const selectedSuggestion = suggestions[selectedSuggestionIndex];
            onChange(selectedSuggestion);
            onSuggestionSelect?.(selectedSuggestion);
            setShowSuggestionsList(false);
            setSelectedSuggestionIndex(-1);
          }
          break;
        case 'Escape':
          setShowSuggestionsList(false);
          setSelectedSuggestionIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [
      showSuggestionsList,
      suggestions,
      selectedSuggestionIndex,
      onChange,
      onSuggestionSelect,
    ]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      onSuggestionSelect?.(suggestion);
      setShowSuggestionsList(false);
      setSelectedSuggestionIndex(-1);
      inputRef.current?.focus();
    },
    [onChange, onSuggestionSelect]
  );

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Filter suggestions based on current value
  const filteredSuggestions = suggestions
    .filter(suggestion =>
      suggestion.toLowerCase().includes(value.toLowerCase())
    )
    .slice(0, maxSuggestions);

  return (
    <div className="relative">
      <div className="relative">
        {showSearchIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            ${baseClasses}
            ${showSearchIcon ? 'pl-10' : ''}
            ${showClearButton && value ? 'pr-10' : ''}
          `}
        />

        {showClearButton && value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <svg
              className="h-5 w-5"
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
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestionsList && filteredSuggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={`
                w-full px-4 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none
                ${index === selectedSuggestionIndex ? 'bg-gray-100' : ''}
              `}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 특화된 검색 입력 컴포넌트들
export function ClientSearchInput(
  props: Omit<SearchInputProps, 'placeholder'>
) {
  return (
    <SearchInput {...props} placeholder="Search clients by name or email..." />
  );
}

export function InstrumentSearchInput(
  props: Omit<SearchInputProps, 'placeholder'>
) {
  return (
    <SearchInput
      {...props}
      placeholder="Search instruments by maker or type..."
    />
  );
}

export function ConnectionSearchInput(
  props: Omit<SearchInputProps, 'placeholder'>
) {
  return (
    <SearchInput {...props} placeholder="Search connections by notes..." />
  );
}
