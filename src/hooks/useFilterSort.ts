import { useCallback, useMemo, useState, useReducer } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

type SortOrder = 'asc' | 'desc';

interface UseFilterSortOptions<T> {
  searchFields?: (keyof T)[];
  initialSearchTerm?: string;
  externalSearchTerm?: string;
  initialSortBy?: keyof T | string;
  initialSortOrder?: SortOrder;
  debounceMs?: number;
  customFilter?: (item: T, term: string) => boolean;
}

interface UseFilterSortReturn<T> {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  sortBy: keyof T | string;
  sortOrder: SortOrder;
  handleSort: (field: keyof T | string) => void;
  getSortArrow: (field: keyof T | string) => string;
  items: T[];
}

const collator =
  typeof Intl !== 'undefined'
    ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    : null;

// FIXED: Date.parse is now safer - only parses ISO-like date strings to avoid false positives
// Date.parse("123") can be parsed as a date in some environments, causing incorrect comparisons
// Now uses regex pattern to match ISO date strings (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[\+\-]\d{2}:\d{2})?)?$/;

function isLikelyDateString(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Date objects or ISO strings (with pattern check to avoid false positives)
  const aDate =
    a instanceof Date
      ? a
      : typeof a === 'string' && isLikelyDateString(a) && !isNaN(Date.parse(a))
        ? new Date(a)
        : null;
  const bDate =
    b instanceof Date
      ? b
      : typeof b === 'string' && isLikelyDateString(b) && !isNaN(Date.parse(b))
        ? new Date(b)
        : null;
  if (aDate && bDate && !isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
    return aDate.getTime() - bDate.getTime();
  }

  // FIXED: More strict numeric coercion - only treat as numeric when it's really numeric
  // Avoids treating '' as 0, ' ' as 0, or '0012' as 12 which can produce surprising ordering
  const isNumericString = (v: unknown): boolean =>
    typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim());

  const an = typeof a === 'number' ? a : isNumericString(a) ? Number(a) : NaN;
  const bn = typeof b === 'number' ? b : isNumericString(b) ? Number(b) : NaN;
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;

  const as = String(a);
  const bs = String(b);
  return collator ? collator.compare(as, bs) : as.localeCompare(bs);
}

type SortState = {
  sortBy: string;
  sortOrder: SortOrder;
  initialSortBy: string;
  initialSortOrder: SortOrder;
};

type SortAction =
  | { type: 'SORT'; field: string }
  | { type: 'RESET'; field: string; order: SortOrder };

function sortReducer(state: SortState, action: SortAction): SortState {
  switch (action.type) {
    case 'SORT':
      if (state.sortBy === action.field) {
        // Same field: toggle order (asc -> desc -> asc)
        if (state.sortOrder === 'asc') {
          // First click: asc -> desc
          return {
            ...state,
            sortBy: action.field,
            sortOrder: 'desc',
          };
        } else {
          // Second click: desc -> asc (toggle back)
          return {
            ...state,
            sortBy: action.field,
            sortOrder: 'asc',
          };
        }
      } else {
        // Different field: reset to asc
        return {
          ...state,
          sortBy: action.field,
          sortOrder: 'asc',
        };
      }
    case 'RESET':
      return {
        ...state,
        sortBy: action.field,
        sortOrder: action.order,
      };
    default:
      return state;
  }
}

export function useFilterSort<T>(
  inputItems: T[],
  {
    searchFields = [],
    initialSearchTerm = '',
    externalSearchTerm,
    initialSortBy = '' as keyof T | string,
    initialSortOrder = 'asc',
    debounceMs = 200,
    customFilter,
  }: UseFilterSortOptions<T> = {}
): UseFilterSortReturn<T> {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [sortState, dispatchSort] = useReducer(sortReducer, {
    sortBy: initialSortBy as string,
    sortOrder: initialSortOrder,
    initialSortBy: initialSortBy as string,
    initialSortOrder: initialSortOrder,
  });
  const { sortBy, sortOrder } = sortState;

  const sourceTerm = externalSearchTerm ?? searchTerm;
  const debounced = useDebounce(sourceTerm, debounceMs);
  const term = debounced.trim().toLowerCase();

  const searched = useMemo(() => {
    if (!term) return inputItems;

    return inputItems.filter(item => {
      if (customFilter) return customFilter(item, term); // pass normalized term

      if (!searchFields || searchFields.length === 0) return true;

      return searchFields.some(field => {
        const value = (item as Record<string, unknown>)[field as string];
        if (value == null) return false;

        if (Array.isArray(value)) {
          return value.join(' ').toLowerCase().includes(term);
        }

        return String(value).toLowerCase().includes(term);
      });
    });
  }, [inputItems, term, searchFields, customFilter]);

  const sorted = useMemo(() => {
    if (!sortBy) return searched;

    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortBy as string];
      const bv = (b as Record<string, unknown>)[sortBy as string];
      const cmp = compareValues(av, bv);
      return cmp * dir;
    });
  }, [searched, sortBy, sortOrder]);

  // FIXED: Use reducer to ensure sortBy and sortOrder update atomically
  // This prevents issues where setSortOrder inside setSortBy callback doesn't update correctly
  const handleSort = useCallback((field: keyof T | string) => {
    dispatchSort({ type: 'SORT', field: field as string });
  }, []);

  const getSortArrow = useCallback(
    (field: keyof T | string) =>
      sortBy === field ? (sortOrder === 'asc' ? '↑' : '↓') : '',
    [sortBy, sortOrder]
  );

  return {
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    handleSort,
    getSortArrow,
    items: sorted,
  };
}
