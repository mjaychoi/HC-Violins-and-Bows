/**
 * Get unique string values from an array of items for a specific field
 * Type-safe version that properly narrows types using type guard
 */
export function getUniqueStringValues<T, K extends keyof T>(
  items: readonly T[],
  field: K
): string[] {
  const values = items
    .map(item => item[field] as unknown)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  return Array.from(new Set(values));
}

/**
 * @deprecated Use getUniqueStringValues instead for better type safety
 * Kept for backward compatibility
 */
export function getUniqueValues<T, K extends keyof T>(
  items: T[],
  field: K
): string[] {
  return getUniqueStringValues(items, field);
}

/**
 * Type helper to extract keys that are array types
 */
type ArrayFieldKeys<T> = {
  [K in keyof T]-?: T[K] extends readonly unknown[] ? K : never;
}[keyof T];

/**
 * Get unique string values from an array field across items
 * Only accepts fields that are arrays (type-safe)
 */
export function getUniqueArrayValues<T, K extends ArrayFieldKeys<T>>(
  items: readonly T[],
  field: K
): string[] {
  const all = items.flatMap(item => {
    const value = item[field];
    return Array.isArray(value) ? value : [];
  });
  
  return Array.from(
    new Set(
      all
        .filter(v => v != null && String(v).trim() !== '')
        .map(v => String(v))
    )
  );
}
