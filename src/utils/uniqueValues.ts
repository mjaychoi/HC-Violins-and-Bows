export function getUniqueValues<T, K extends keyof T>(
  items: T[],
  field: K
): string[] {
  const values = items
    .map(item => item[field])
    .filter(v => typeof v === 'string' && v != null) as unknown as string[];
  return Array.from(new Set(values));
}

export function getUniqueArrayValues<T, K extends keyof T>(
  items: T[],
  field: K
): string[] {
  const all = items.flatMap(item => {
    const v = (item as unknown as Record<string, unknown>)[field as string];
    return Array.isArray(v) ? v : [];
  });
  return Array.from(new Set(all.filter(Boolean).map(value => String(value))));
}
