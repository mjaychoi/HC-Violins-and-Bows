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
