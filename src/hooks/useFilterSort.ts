import { useCallback, useMemo, useState } from 'react';
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

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Date objects or ISO strings
  const aDate =
    a instanceof Date
      ? a
      : typeof a === 'string' && !isNaN(Date.parse(a))
        ? new Date(a)
        : null;
  const bDate =
    b instanceof Date
      ? b
      : typeof b === 'string' && !isNaN(Date.parse(b))
        ? new Date(b)
        : null;
  if (aDate && bDate) return aDate.getTime() - bDate.getTime();

  const an = Number(a);
  const bn = Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;

  const as = String(a);
  const bs = String(b);
  return collator ? collator.compare(as, bs) : as.localeCompare(bs);
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
  const [sortBy, setSortBy] = useState<keyof T | string>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);

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

  const handleSort = useCallback(
    (field: keyof T | string) => {
      setSortBy(prev => (prev === field ? prev : field));
      setSortOrder(prev =>
        sortBy === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'
      );
    },
    [sortBy]
  );

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
