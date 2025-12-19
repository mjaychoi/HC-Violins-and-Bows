import { buildFilterOptions, type FieldConfig } from './filters';

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter(v => v !== value)
    : [...list, value];
}

/**
 * ✅ FIXED: 활성 필터 수 계산 - 빈 문자열/빈 객체 처리 개선
 * 공백 문자열이나 빈 배열은 카운트에서 제외하여 더 정확한 필터 상태 반영
 *
 * @param filters - 필터 객체
 * @param options - 카운트 옵션 (boolean 필터 포함 여부 등)
 * @returns 활성 필터 수
 */
export function countActiveFilters(
  filters: Record<string, unknown>,
  options?: { countBooleans?: boolean }
): number {
  let count = 0;
  for (const [key, val] of Object.entries(filters)) {
    if (Array.isArray(val)) {
      // ✅ FIXED: 빈 문자열 제외 (예: ['']는 카운트하지 않음)
      const validValues = val.filter(v => v != null && String(v).trim() !== '');
      count += validValues.length;
      continue;
    }
    if (val && typeof val === 'object') {
      // nested object like priceRange
      // ✅ FIXED: 빈 문자열 값 제외
      const validValues = Object.values(val).filter(
        v => v != null && String(v).trim() !== ''
      );
      count += validValues.length;
      continue;
    }
    // ✅ FIXED: Boolean 필터 카운트 옵션 (예: hasInstruments=true 같은 토글 필터)
    if (options?.countBooleans && typeof val === 'boolean' && val === true) {
      count += 1;
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
 * type 필드는 제거되었지만, Array.isArray로 자동 감지되므로 동작은 동일
 */
export function buildFilterOptionsFromFields<T>(
  items: readonly T[],
  fieldConfig: Record<string, 'simple' | 'array'>
): Record<string, string[]> {
  const config: Record<string, FieldConfig<T>> = {};

  Object.entries(fieldConfig).forEach(([field]) => {
    config[field] = {
      extractor: item => (item as Record<string, unknown>)[field],
    };
  });

  return buildFilterOptions(items, config);
}
