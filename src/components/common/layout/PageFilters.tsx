/**
 * 범용 페이지 필터 컴포넌트
 * Clients, Dashboard 등 FilterPanel + FilterGroup 패턴을 사용하는 페이지에서 공통으로 사용
 */

'use client';

import React from 'react';
import FilterPanel from './FilterPanel';
import FilterGroup from './FilterGroup';
import { AdvancedSearch } from '@/components/common/inputs';
import { filterPanelClasses } from '@/utils/filterUI';
import type { DateRange, FilterOperator } from '@/types/search';

export interface FilterGroupConfig {
  key: string;
  title: string;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  searchable?: boolean;
  defaultCollapsed?: boolean;
  variant?: 'list' | 'card';
  maxHeight?: string;
  /**
   * 옵션 값을 표시할 레이블로 변환하는 함수
   * 예: UUID를 클라이언트 이름으로 변환
   */
  getLabel?: (value: string) => string;
  /**
   * 커스텀 렌더링 함수 (특수 필터의 경우)
   */
  customRender?: () => React.ReactNode;
}

export interface PageFiltersProps {
  /**
   * 필터 패널 열림/닫힘 상태
   */
  isOpen: boolean;
  onClose: () => void;

  /**
   * 필터 그룹 설정 배열
   */
  filterGroups: FilterGroupConfig[];

  /**
   * 활성 필터 수
   */
  activeFiltersCount?: number;

  /**
   * 전체 초기화 핸들러
   */
  onClearAllFilters?: () => void;

  /**
   * 패널 제목
   */
  title?: string;

  /**
   * 검색 입력 (선택적)
   */
  searchConfig?: {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    placeholder?: string;
  };

  /**
   * 활성 필터 배지 표시 (선택적)
   */
  activeBadges?: Array<{
    key: string;
    label: string;
    remove: () => void;
  }>;

  /**
   * 고급 검색 (날짜 범위) (선택적)
   */
  advancedSearchConfig?: {
    dateRange: DateRange | null;
    onDateRangeChange: (range: DateRange | null) => void;
    operator?: FilterOperator;
    onOperatorChange?: (operator: FilterOperator) => void;
    dateFields?: Array<{ field: string; label: string }>;
    onReset?: () => void;
  };

  /**
   * Footer 텍스트 커스터마이즈
   */
  footerText?: (count: number) => string;

  /**
   * Footer 적용 버튼 텍스트
   */
  applyButtonText?: string;

  /**
   * Footer 초기화 버튼 텍스트
   */
  clearButtonText?: string;

  /**
   * Grid 컬럼 수 설정
   */
  gridCols?: '1' | '2' | '3';

  /**
   * data-testid
   */
  dataTestId?: string;

  /**
   * 검색 바와 배지를 패널 밖에 표시할지 여부 (Dashboard 스타일)
   */
  showSearchBar?: boolean;

  /**
   * 필터 토글 버튼 핸들러 (showSearchBar가 true일 때 필요)
   */
  onToggleFilters?: () => void;
}

/**
 * 범용 페이지 필터 컴포넌트
 *
 * @example
 * ```tsx
 * <PageFilters
 *   isOpen={showFilters}
 *   onClose={() => setShowFilters(false)}
 *   filterGroups={[
 *     {
 *       key: 'status',
 *       title: 'Status',
 *       options: filterOptions.status,
 *       selectedValues: filters.status,
 *       onToggle: (value) => handleFilterChange('status', value),
 *       searchable: true,
 *     },
 *   ]}
 *   activeFiltersCount={getActiveFiltersCount()}
 *   onClearAllFilters={clearAllFilters}
 * />
 * ```
 */
export default function PageFilters({
  isOpen,
  onClose,
  filterGroups,
  activeFiltersCount = 0,
  onClearAllFilters,
  title = '필터 옵션',
  searchConfig,
  activeBadges,
  advancedSearchConfig,
  footerText = count => `검색/필터 ${count}개 적용 중`,
  applyButtonText = '적용',
  clearButtonText = '전체 초기화',
  gridCols = '3',
  dataTestId = 'filters-panel',
  showSearchBar = false,
  onToggleFilters,
}: PageFiltersProps) {
  const gridClass = {
    '1': 'grid-cols-1',
    '2': 'grid-cols-1 md:grid-cols-2',
    '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[gridCols];

  const hasActiveFilters =
    activeFiltersCount > 0 ||
    Boolean(searchConfig?.searchTerm) ||
    Boolean(activeBadges?.length) ||
    Boolean(
      advancedSearchConfig?.dateRange?.from ||
      advancedSearchConfig?.dateRange?.to
    );

  return (
    <>
      {/* Search Bar (선택적, showSearchBar가 true일 때 표시) */}
      {showSearchBar &&
        (searchConfig || activeBadges?.length || advancedSearchConfig) && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Input */}
              {searchConfig && (
                <input
                  placeholder={searchConfig.placeholder || 'Search...'}
                  className="flex-1 min-w-[260px] h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={searchConfig.searchTerm}
                  onChange={e => searchConfig.onSearchChange(e.target.value)}
                  aria-label="Search items"
                />
              )}

              {/* Advanced Search */}
              {advancedSearchConfig && (
                <AdvancedSearch
                  dateRange={advancedSearchConfig.dateRange || null}
                  onDateRangeChange={advancedSearchConfig.onDateRangeChange}
                  operator={advancedSearchConfig.operator} // Optional - not used
                  onOperatorChange={advancedSearchConfig.onOperatorChange} // Optional - not used
                  dateFields={advancedSearchConfig.dateFields || []}
                  onReset={advancedSearchConfig.onReset}
                />
              )}

              {/* Filter Toggle Button */}
              {onToggleFilters && (
                <button
                  data-filter-button
                  onClick={onToggleFilters}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label={`${isOpen ? 'Close' : 'Open'} filter panel (${activeFiltersCount} active filters)`}
                  aria-expanded={isOpen}
                  aria-controls={dataTestId}
                >
                  Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                </button>
              )}

              {/* Reset Button */}
              {onClearAllFilters && hasActiveFilters && (
                <button
                  onClick={onClearAllFilters}
                  className="h-10 px-3 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors text-sm font-medium"
                  aria-label="Clear all filters"
                  type="button"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Active Badges */}
            {hasActiveFilters && activeBadges && activeBadges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {activeBadges.map(badge => (
                  <span
                    key={badge.key}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-100"
                  >
                    {badge.label}
                    <button
                      aria-label={`Remove filter: ${badge.label}`}
                      onClick={badge.remove}
                      className="text-blue-500 hover:text-blue-700"
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isOpen}
        onClose={onClose}
        dataTestId={dataTestId}
        title={title}
        contentClassName={filterPanelClasses.content}
        footer={
          <div className={`${filterPanelClasses.footer} px-4 py-3`}>
            <div className="text-sm text-gray-600">
              {activeFiltersCount > 0 && (
                <span>{footerText(activeFiltersCount)}</span>
              )}
            </div>
            <div className="flex gap-2">
              {onClearAllFilters && activeFiltersCount > 0 && (
                <button
                  onClick={onClearAllFilters}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-colors"
                  type="button"
                >
                  {clearButtonText}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                type="button"
              >
                {applyButtonText}
              </button>
            </div>
          </div>
        }
      >
        <div className={`grid ${gridClass} gap-4 pb-4`}>
          {filterGroups.map(group => {
            // 커스텀 렌더링이 있으면 그것을 사용
            if (group.customRender) {
              return (
                <React.Fragment key={group.key}>
                  {group.customRender()}
                </React.Fragment>
              );
            }

            // 기본 FilterGroup 렌더링
            return (
              <FilterGroup
                key={group.key}
                title={group.title}
                options={group.options}
                selectedValues={group.selectedValues}
                onToggle={group.onToggle}
                searchable={group.searchable ?? false}
                defaultCollapsed={group.defaultCollapsed ?? false}
                variant={group.variant ?? 'list'}
                maxHeight={group.maxHeight ?? 'max-h-48'}
                getLabel={group.getLabel}
              />
            );
          })}
        </div>
      </FilterPanel>
    </>
  );
}
