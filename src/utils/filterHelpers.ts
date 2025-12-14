import { buildFilterOptions, type FieldConfig } from './filters';

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter(v => v !== value)
    : [...list, value];
}

export function countActiveFilters(filters: Record<string, unknown>): number {
  let count = 0;
  for (const [key, val] of Object.entries(filters)) {
    if (Array.isArray(val)) {
      count += val.length;
      continue;
    }
    if (val && typeof val === 'object') {
      // nested object like priceRange
      count += Object.values(val).filter(Boolean).length;
      continue;
    }
    // booleans or primitives not counted by default
    void key;
  }
  return count;
}

export function arrowToClass(
  arrow: string
): 'sort-neutral' | 'sort-asc' | 'sort-desc' {
  if (!arrow) return 'sort-neutral';
  return arrow === '↑' ? 'sort-asc' : 'sort-desc';
}

/**
 * ✅ FIXED: buildFilterOptions의 thin wrapper (하위 호환성)
 * 'simple' | 'array' 타입을 extractor로 변환
 */
export function buildFilterOptionsFromFields<T>(
  items: T[],
  fieldConfig: Record<string, 'simple' | 'array'>
): Record<string, string[]> {
  const config: Record<string, FieldConfig<T>> = {};

  Object.entries(fieldConfig).forEach(([field, type]) => {
    config[field] = {
      extractor: item => (item as Record<string, unknown>)[field],
      type: type === 'array' ? 'array' : 'scalar',
    };
  });

  return buildFilterOptions(items, config);
}
