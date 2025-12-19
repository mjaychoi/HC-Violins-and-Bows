/**
 * Common filter utilities for building filter options from data
 * ✅ FIXED: buildFilterOptions를 범용 함수로 통합 (extractor/sortFn/normalize 지원)
 *
 * 입력 검증/정규화 유틸과 결합 예시:
 * - Email 필드: normalize: (v) => sanitizeEmail(String(v))
 * - Date 필드: normalize: (v) => formatDateOnly(String(v), 'iso')
 * - 일반 문자열: normalize는 기본값 사용 (trim + 빈 문자열 필터링)
 */

export type FieldConfig<T> = {
  label?: string;
  extractor?: (item: T) => unknown; // scalar or array return OK
  sortFn?: (a: string, b: string) => number;
  /**
   * Normalize function to transform values before adding to filter options
   * Return null to exclude the value from options
   *
   * Example with sanitization utilities:
   * - Email: normalize: (v) => sanitizeEmail(String(v))
   * - Date: normalize: (v) => formatDateOnly(String(v), 'iso')
   * - Default: trim + filter empty strings (automatically applied if not provided)
   */
  normalize?: (v: unknown) => string | null;
};

// ✅ FIXED: Intl.Collator for consistent sorting (numeric-aware, case-insensitive)
const defaultCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * ✅ FIXED: 범용 필터 옵션 빌더 - array/simple 분기 없이 extractor로 처리
 * 타입 캐스팅 대폭 감소, normalize까지 한 곳에서 일관되게 처리
 * - items는 readonly로 변경하여 범용성 향상
 * - normalize 기본값: 공백 문자열도 필터링 (trim 후 빈 문자열이면 null)
 * - extractor 배열 반환 시 문자열 아닌 값도 안전하게 처리
 * - Intl.Collator로 정렬 (숫자 포함 문자열, 대소문자 섞임 처리)
 */
export function buildFilterOptions<T>(
  items: readonly T[],
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
        // ✅ FIXED: normalize 기본값 개선 - 공백 문자열도 필터링
        const norm = cfg.normalize
          ? cfg.normalize(v)
          : v == null
            ? null
            : String(v).trim() || null; // trim 후 빈 문자열이면 null
        if (norm) values.add(norm);
      };

      if (Array.isArray(raw)) {
        // ✅ FIXED: 배열 내 문자열 아닌 값도 안전하게 처리
        raw.forEach(push);
      } else {
        push(raw);
      }
    }

    const arr = Array.from(values);
    // ✅ FIXED: Intl.Collator 사용 (숫자 포함 문자열, 대소문자 섞임 처리)
    arr.sort(cfg.sortFn ?? ((a, b) => defaultCollator.compare(a, b)));
    out[key] = arr;
  }

  return out;
}

/**
 * ✅ FIXED: 기존 함수들을 thin wrapper로 유지 (하위 호환성)
 */
export function buildFilterOptionsFromField<T extends Record<string, unknown>>(
  items: readonly T[],
  field: keyof T
): string[] {
  const result = buildFilterOptions(items, {
    [String(field)]: { extractor: item => item[field] },
  });
  return result[String(field)] || [];
}

export function buildFilterOptionsFromArrayField<
  T extends Record<string, unknown>,
>(items: readonly T[], field: keyof T): string[] {
  const result = buildFilterOptions(items, {
    [String(field)]: {
      extractor: item => item[field],
    },
  });
  return result[String(field)] || [];
}

export function buildMultiFieldFilterOptions<T extends Record<string, unknown>>(
  items: readonly T[],
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
