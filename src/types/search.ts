// 고급 검색 타입 정의

export type FilterOperator = 'AND' | 'OR';

export interface DateRange {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

export interface AdvancedFilter {
  field: string;
  operator:
    | 'equals'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'greaterThan'
    | 'lessThan'
    | 'between'
    | 'in';
  value: string | number | string[] | DateRange | null;
  operatorType?: FilterOperator; // AND or OR
}

export interface AdvancedSearchState {
  dateRange?: DateRange;
  filters: AdvancedFilter[];
  globalOperator: FilterOperator; // 전체 필터 간 연산자
}

export interface AdvancedSearchOptions {
  dateFields?: string[]; // 날짜 필드 목록 (예: ['created_at', 'due_date'])
  filterableFields?: Array<{
    field: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    options?: string[]; // select 타입일 때 옵션
  }>;
}
