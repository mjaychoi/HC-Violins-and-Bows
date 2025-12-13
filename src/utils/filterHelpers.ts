import { getUniqueValues, getUniqueArrayValues } from './uniqueValues';

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
 * Build filter options from multiple fields at once
 * Generalized version that can be used across Dashboard/Calendar/Clients/Instruments
 * Simplified wrapper that handles both simple fields and array fields
 *
 * @param items - Array of items to extract unique values from
 * @param fieldConfig - Configuration object mapping field names to their types ('simple' or 'array')
 * @returns Object with field names as keys and arrays of unique values as values
 *
 * @example
 * ```ts
 * // Simple fields
 * const options = buildFilterOptionsFromFields(instruments, {
 *   status: 'simple',
 *   maker: 'simple',
 * });
 *
 * // Mix of simple and array fields
 * const clientOptions = buildFilterOptionsFromFields(clients, {
 *   last_name: 'simple',
 *   tags: 'array',
 * });
 * ```
 */
export function buildFilterOptionsFromFields<T>(
  items: T[],
  fieldConfig: Record<string, 'simple' | 'array'>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  Object.entries(fieldConfig).forEach(([field, type]) => {
    if (type === 'array') {
      // Type assertion needed because field is string from Object.entries
      // The caller should ensure field is a valid array field of T
      result[field] = getUniqueArrayValues(
        items as unknown as Array<Record<string, readonly unknown[]>>,
        field as keyof Record<string, readonly unknown[]>
      );
    } else {
      result[field] = getUniqueValues(
        items as unknown as Array<Record<string, unknown>>,
        field
      );
    }
  });

  return result;
}
