'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

interface FilterGroupProps {
  title: string;
  options: string[];
  selectedValues: string[];
  /**
   * 단일 토글 (기존 API)
   */
  onToggle?: (value: string) => void;
  /**
   * 배치 업데이트 (전체 선택/해제 최적화)
   * onToggle이 제공되면 onToggle 사용, 없으면 onChangeSelected 사용
   */
  onChangeSelected?: (next: string[]) => void;
  searchable?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  maxHeight?: string;
  variant?: 'list' | 'card';
  /**
   * 옵션 값을 표시할 레이블로 변환하는 함수
   * 예: UUID를 클라이언트 이름으로 변환
   */
  getLabel?: (value: string) => string;
}

export default function FilterGroup({
  title,
  options,
  selectedValues,
  onToggle,
  onChangeSelected,
  searchable = false,
  collapsible = true,
  defaultCollapsed = false,
  maxHeight = 'max-h-64',
  variant = 'list',
  getLabel,
}: FilterGroupProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);

  const filteredOptions = useMemo(() => {
    if (!debouncedSearch.trim()) return options;
    const searchLower = debouncedSearch.toLowerCase();
    return options.filter(option => {
      const label = getLabel ? getLabel(option) : option;
      return label.toLowerCase().includes(searchLower);
    });
  }, [options, debouncedSearch, getLabel]);

  const activeCount = selectedValues.length;
  const allSelected =
    options.length > 0 && selectedValues.length === options.length;
  // FIXED: Increased spacing and subtle background for better visual breathing
  const containerClass =
    variant === 'card'
      ? 'rounded-lg border border-gray-100 bg-gray-50/80 p-4 shadow-sm'
      : 'border-b border-gray-100 pb-4 mb-4 last:border-b-0 last:mb-0 bg-gray-50/30 px-3 py-3 rounded-md';

  // 자동 확장: activeCount가 0에서 > 0으로 변경되면 자동으로 펼치기
  useEffect(() => {
    if (activeCount > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [activeCount, isExpanded]);

  // ✅ FIXED: 전체 선택/해제 O(N) 최적화 - onChangeSelected 사용
  const handleSelectAll = useCallback(() => {
    if (onChangeSelected) {
      // 배치 업데이트 (가장 깔끔)
      onChangeSelected(allSelected ? [] : options);
    } else if (onToggle) {
      // 기존 API 유지 (하지만 O(N) 업데이트)
      if (allSelected) {
        // 모두 해제
        selectedValues.forEach(value => onToggle(value));
      } else {
        // 모두 선택
        options.forEach(option => {
          if (!selectedValues.includes(option)) {
            onToggle(option);
          }
        });
      }
    }
  }, [allSelected, options, selectedValues, onToggle, onChangeSelected]);

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {collapsible ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80"
              type="button"
              aria-expanded={isExpanded}
              aria-controls={`filter-group-${title
                .replace(/[^a-zA-Z0-9]/g, '-')
                .toLowerCase()}`}
            >
              <h4 className="text-sm font-semibold text-gray-900 truncate">
                {title}
              </h4>
              {activeCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                  {activeCount}
                </span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 truncate">
                {title}
              </h4>
              {activeCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                  {activeCount}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {options.length > 2 && (
            <button
              onClick={handleSelectAll}
              className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              type="button"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          )}
          {collapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-expanded={isExpanded}
              aria-label={`${title} ${isExpanded ? '접기' : '펼치기'}`}
              type="button"
            >
              <svg
                className={`w-4 h-4 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
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
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      {isExpanded && searchable && options.length > 5 && (
        <div className="mb-2">
          <input
            type="text"
            placeholder={`${title} 검색...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-8 px-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {/* Options List */}
      {isExpanded && (
        <div
          id={`filter-group-${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
          className={`space-y-1.5 ${maxHeight} overflow-y-auto pr-1`}
          role="group"
          aria-label={`${title} 필터 옵션`}
        >
          {filteredOptions.length === 0 ? (
            <div className="text-xs text-gray-400 py-2 text-center">
              검색 결과가 없습니다
            </div>
          ) : (
            filteredOptions.map(option => {
              const displayLabel = getLabel ? getLabel(option) : option;
              return (
                <label
                  key={option}
                  className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => {
                      if (onChangeSelected) {
                        // 배치 업데이트 사용
                        const next = selectedValues.includes(option)
                          ? selectedValues.filter(v => v !== option)
                          : [...selectedValues, option];
                        onChangeSelected(next);
                      } else if (onToggle) {
                        // 기존 API
                        onToggle(option);
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded shrink-0"
                  />
                  <span className="text-sm text-gray-700 truncate flex-1">
                    {displayLabel}
                  </span>
                  {selectedValues.includes(option) && (
                    <svg
                      className="w-3 h-3 text-blue-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
