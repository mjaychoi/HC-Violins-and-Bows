/**
 * Common filter utilities for building filter options from data
 * ✅ FIXED: buildFilterOptions를 범용 함수로 통합 (extractor/sortFn/normalize 지원)
 */

export type FieldType = 'scalar' | 'array';

export type FieldConfig<T> = {
  label?: string;
  type?: FieldType; // default 'scalar'
  extractor?: (item: T) => unknown; // scalar or array return OK
  sortFn?: (a: string, b: string) => number;
  normalize?: (v: unknown) => string | null;
};

/**
 * ✅ FIXED: 범용 필터 옵션 빌더 - array/simple 분기 없이 extractor로 처리
 * 타입 캐스팅 대폭 감소, normalize까지 한 곳에서 일관되게 처리
 */
export function buildFilterOptions<T>(
  items: T[],
  fields: Record<string, FieldConfig<T>>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  for (const [key, cfg] of Object.entries(fields)) {
    const values = new Set<string>();

    for (const item of items) {
      const raw = cfg.extractor
        ? cfg.extractor(item)
        : (item as Record<string, unknown>)[key];

      const push = (v: unknown) => {
        const norm = cfg.normalize
          ? cfg.normalize(v)
          : v == null || v === ''
            ? null
            : String(v);
        if (norm) values.add(norm);
      };

      if (Array.isArray(raw)) {
        raw.forEach(push);
      } else {
        push(raw);
      }
    }

    const arr = Array.from(values);
    arr.sort(cfg.sortFn ?? ((a, b) => a.localeCompare(b)));
    out[key] = arr;
  }

  return out;
}

/**
 * ✅ FIXED: 기존 함수들을 thin wrapper로 유지 (하위 호환성)
 */
export function buildFilterOptionsFromField<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T
): string[] {
  const result = buildFilterOptions(items, {
    [String(field)]: { extractor: item => item[field] },
  });
  return result[String(field)] || [];
}

export function buildFilterOptionsFromArrayField<
  T extends Record<string, unknown>,
>(items: T[], field: keyof T): string[] {
  const result = buildFilterOptions(items, {
    [String(field)]: {
      extractor: item => item[field],
      type: 'array',
    },
  });
  return result[String(field)] || [];
}

export function buildMultiFieldFilterOptions<T extends Record<string, unknown>>(
  items: T[],
  fields: (keyof T)[]
): Record<string, string[]> {
  const config: Record<string, FieldConfig<T>> = {};
  fields.forEach(field => {
    config[String(field)] = { extractor: item => item[field] };
  });
  return buildFilterOptions(items, config);
}

/**
 * Sort priority values in a specific order
 * Useful for priority/status fields that have a logical order
 */
export function sortByPriority<T extends string>(
  values: T[],
  priorityOrder: Record<T, number>
): T[] {
  return [...values].sort((a, b) => {
    const aPriority = priorityOrder[a] ?? 0;
    const bPriority = priorityOrder[b] ?? 0;
    return bPriority - aPriority; // Higher priority first
  });
}
