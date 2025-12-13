import { getUniqueValues, getUniqueArrayValues } from '../uniqueValues';

interface TestItem {
  id: string;
  name: string;
  tags?: readonly string[]; // Optional array field - for getUniqueValues tests, tags may not exist
  category?: string;
}

// Separate interface for tests that require tags to be present
// Note: Cannot extend TestItem because tags is optional there, so ArrayFieldKeys won't work
interface TestItemWithTags {
  id: string;
  name: string;
  tags: readonly string[]; // Required for ArrayFieldKeys to work with getUniqueArrayValues
  category?: string;
}

describe('uniqueValues', () => {
  describe('getUniqueValues', () => {
    it('should return unique string values from array', () => {
      const items: TestItem[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Alice' },
        { id: '4', name: 'Charlie' },
      ];

      const result = getUniqueValues(items, 'name');
      expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
      expect(result.length).toBe(3);
    });

    it('should filter out null and undefined values', () => {
      const items: TestItem[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: null as unknown as string },
        { id: '3', name: undefined as unknown as string },
        { id: '4', name: 'Bob' },
      ];

      const result = getUniqueValues(items, 'name');
      expect(result).toEqual(['Alice', 'Bob']);
    });

    it('should return empty array when no string values', () => {
      const items: TestItem[] = [
        { id: '1', name: null as unknown as string },
        { id: '2', name: undefined as unknown as string },
      ];

      const result = getUniqueValues(items, 'name');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      const items: TestItem[] = [];
      const result = getUniqueValues(items, 'name');
      expect(result).toEqual([]);
    });
  });

  describe('getUniqueArrayValues', () => {
    it('should return unique values from array fields', () => {
      const items: TestItemWithTags[] = [
        { id: '1', name: 'Item1', tags: ['tag1', 'tag2'] },
        { id: '2', name: 'Item2', tags: ['tag2', 'tag3'] },
        { id: '3', name: 'Item3', tags: ['tag1', 'tag4'] },
      ];

      // 'tags' is a required readonly array field in TestItemWithTags, so it's a valid ArrayFieldKeys
      const result = getUniqueArrayValues(items, 'tags');
      expect(result).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
    });

    it('should handle empty/null array values', () => {
      const items: TestItemWithTags[] = [
        { id: '1', name: 'Item1', tags: ['tag1'] },
        { id: '2', name: 'Item2', tags: [] },
        { id: '3', name: 'Item3', tags: [] },
        { id: '4', name: 'Item4', tags: ['tag2'] },
      ];

      // 'tags' is a required readonly array field in TestItemWithTags, so it's a valid ArrayFieldKeys
      const result = getUniqueArrayValues(items, 'tags');
      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('should filter out falsy values', () => {
      const items: TestItemWithTags[] = [
        { id: '1', name: 'Item1', tags: ['tag1', '', 'tag2'] },
        { id: '2', name: 'Item2', tags: ['tag3'] },
      ];

      // 'tags' is a required readonly array field in TestItemWithTags, so it's a valid ArrayFieldKeys
      const result = getUniqueArrayValues(items, 'tags');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array when no array values', () => {
      const items: TestItemWithTags[] = [
        { id: '1', name: 'Item1', tags: [] },
        { id: '2', name: 'Item2', tags: [] },
      ];

      // 'tags' is a required readonly array field in TestItemWithTags, so it's a valid ArrayFieldKeys
      const result = getUniqueArrayValues(items, 'tags');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      const items: TestItemWithTags[] = [];
      // 'tags' is a required readonly array field in TestItemWithTags, so it's a valid ArrayFieldKeys
      const result = getUniqueArrayValues(items, 'tags');
      expect(result).toEqual([]);
    });
  });
});
