/**
 * Common filter utilities for building filter options from data
 */

import { getUniqueValues as getUniqueValuesGeneric, getUniqueArrayValues } from './uniqueValues';

/**
 * Build filter options from an array of items
 * Extracts unique values for specified fields
 */
export function buildFilterOptions<T extends Record<string, unknown>>(
  items: T[],
  fieldConfig: {
    [K in keyof T]?: {
      field: K;
      extractor?: (item: T) => unknown;
      sortFn?: (a: unknown, b: unknown) => number;
    };
  }
): {
  [K in keyof typeof fieldConfig]: string[];
} {
  const result: Record<string, string[]> = {};

  Object.entries(fieldConfig).forEach(([key, config]) => {
    if (!config) return;

    const values = new Set<string>();

    items.forEach(item => {
      let value: unknown;

      if (config.extractor) {
        value = config.extractor(item);
      } else {
        value = item[config.field];
      }

      if (value != null) {
        if (Array.isArray(value)) {
          value.forEach(v => {
            if (v != null) values.add(String(v));
          });
        } else {
          values.add(String(value));
        }
      }
    });

    const sorted = Array.from(values).sort((a, b) => {
      if (config.sortFn) {
        return config.sortFn(a, b);
      }
      return a.localeCompare(b);
    });

    result[key] = sorted;
  });

  return result as {
    [K in keyof typeof fieldConfig]: string[];
  };
}

/**
 * Build filter options from a single field using getUniqueValues
 * Simpler version for single field extraction
 */
export function buildFilterOptionsFromField<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T
): string[] {
  return getUniqueValuesGeneric(items, field);
}

/**
 * Build filter options from an array field using getUniqueArrayValues
 */
export function buildFilterOptionsFromArrayField<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T
): string[] {
  // Type assertion: ensure field is an array field
  // Caller must ensure field points to an array type
  return getUniqueArrayValues(
    items as unknown as Array<Record<string, readonly unknown[]>>,
    field as keyof Record<string, readonly unknown[]>
  );
}

/**
 * Build filter options for multiple fields at once
 * Returns an object with field names as keys and arrays of unique values as values
 */
export function buildMultiFieldFilterOptions<T extends Record<string, unknown>>(
  items: T[],
  fields: (keyof T)[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  fields.forEach(field => {
    // Type assertion needed because getUniqueValuesGeneric expects items that satisfy its constraint
    result[String(field)] = getUniqueValuesGeneric(items as unknown as Array<Record<string, unknown>>, String(field));
  });

  return result;
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
