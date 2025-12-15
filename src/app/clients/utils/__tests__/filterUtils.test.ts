import { Client } from '@/types';
import {
  clearAllFilters,
  getSortArrow,
  handleColumnSort,
  handleFilterChange,
  getUniqueContactNumbers,
  getUniqueEmails,
  getUniqueFirstNames,
  getUniqueInterests,
  getUniqueLastNames,
  getUniqueTags,
} from '../filterUtils';

const baseClient: Client = {
  id: '1',
  last_name: 'Kim',
  first_name: 'Jiho',
  contact_number: '010-1111-2222',
  email: 'jiho@example.com',
  tags: ['Owner', 'Musician'],
  interest: 'Active',
  note: 'Prefers Strad models',
  client_number: 'CL001',
  created_at: '2024-01-01',
};

const sampleClients: Client[] = [
  baseClient,
  {
    ...baseClient,
    id: '2',
    last_name: 'Lee',
    first_name: 'Ara',
    contact_number: '010-3333-4444',
    email: 'ara@example.com',
    tags: ['Collector', 'Musician'],
    interest: 'Passive',
    client_number: 'CL002',
  },
  {
    ...baseClient,
    id: '3',
    last_name: null,
    first_name: null,
    contact_number: null,
    email: null,
    tags: [],
    interest: null,
    client_number: null,
  },
];

describe('filterUtils', () => {
  it('extracts unique primitive fields while ignoring nulls', () => {
    expect(getUniqueLastNames(sampleClients)).toEqual(['Kim', 'Lee']);
    expect(getUniqueFirstNames(sampleClients)).toEqual(['Jiho', 'Ara']);
    expect(getUniqueContactNumbers(sampleClients)).toEqual([
      '010-1111-2222',
      '010-3333-4444',
    ]);
    expect(getUniqueEmails(sampleClients)).toEqual([
      'jiho@example.com',
      'ara@example.com',
    ]);
    expect(getUniqueInterests(sampleClients)).toEqual(['Active', 'Passive']);
  });

  it('flattens and deduplicates tags from all clients', () => {
    expect(getUniqueTags(sampleClients)).toEqual([
      'Owner',
      'Musician',
      'Collector',
    ]);
  });

  it('toggles filter values without mutating existing filters', () => {
    const current = { tags: ['Owner'], interest: [] as string[] };

    const withNewTag = handleFilterChange(current, 'tags', 'Collector');
    expect(withNewTag).toEqual({
      tags: ['Owner', 'Collector'],
      interest: [],
    });
    expect(current.tags).toEqual(['Owner']); // ensure immutability

    const removed = handleFilterChange(withNewTag, 'tags', 'Owner');
    expect(removed.tags).toEqual(['Collector']);
  });

  it('returns a fully reset filter object', () => {
    expect(clearAllFilters()).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
  });

  it('handles column sort toggling and resets order for new columns', () => {
    expect(handleColumnSort('last_name', 'asc', 'last_name')).toEqual({
      sortBy: 'last_name',
      sortOrder: 'desc',
    });
    expect(handleColumnSort('last_name', 'desc', 'first_name')).toEqual({
      sortBy: 'first_name',
      sortOrder: 'asc',
    });
  });

  it('returns sort arrow names based on current sort', () => {
    expect(getSortArrow('last_name', 'asc', 'first_name')).toBe('sort-neutral');
    expect(getSortArrow('last_name', 'asc', 'last_name')).toBe('sort-asc');
    expect(getSortArrow('last_name', 'desc', 'last_name')).toBe('sort-desc');
  });

  it('handles EMPTY_FILTER_STATE constant', () => {
    const { EMPTY_FILTER_STATE } = require('../filterUtils');
    expect(EMPTY_FILTER_STATE).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    // clearAllFilters returns a new object with same values (spread operator creates new object)
    expect(clearAllFilters()).toEqual(EMPTY_FILTER_STATE);
    // ✅ FIXED: 스프레드 연산자로 새 객체를 만들므로 참조는 다름
    expect(clearAllFilters()).not.toBe(EMPTY_FILTER_STATE);
  });

  it('handleFilterChange works with all filter categories', () => {
    const base = {
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    };

    // Test last_name
    const withLastName = handleFilterChange(base, 'last_name', 'Doe');
    expect(withLastName.last_name).toEqual(['Doe']);
    expect(withLastName.first_name).toEqual([]);

    // Test contact_number
    const withContact = handleFilterChange(
      base,
      'contact_number',
      '010-1234-5678'
    );
    expect(withContact.contact_number).toEqual(['010-1234-5678']);

    // Test email
    const withEmail = handleFilterChange(base, 'email', 'test@example.com');
    expect(withEmail.email).toEqual(['test@example.com']);

    // Test interest
    const withInterest = handleFilterChange(base, 'interest', 'Active');
    expect(withInterest.interest).toEqual(['Active']);

    // Test hasInstruments
    const withHasInst = handleFilterChange(
      base,
      'hasInstruments',
      'Has Instruments'
    );
    expect(withHasInst.hasInstruments).toEqual(['Has Instruments']);
  });

  it('handleFilterChange handles multiple toggles correctly', () => {
    let state = {
      tags: [],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    // Add multiple tags
    state = handleFilterChange(state, 'tags', 'Owner') as typeof state;
    state = handleFilterChange(state, 'tags', 'Musician') as typeof state;
    expect(state.tags).toEqual(['Owner', 'Musician']);

    // Remove one tag
    state = handleFilterChange(state, 'tags', 'Owner') as typeof state;
    expect(state.tags).toEqual(['Musician']);

    // Remove remaining tag
    state = handleFilterChange(state, 'tags', 'Musician') as typeof state;
    expect(state.tags).toEqual([]);
  });

  it('handleFilterChange does not mutate original state', () => {
    const original = {
      tags: ['Owner'],
      interest: ['Active'],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const updated = handleFilterChange(original, 'tags', 'Musician');
    expect(updated.tags).toEqual(['Owner', 'Musician']);
    expect(original.tags).toEqual(['Owner']); // Original unchanged
    expect(updated.interest).toEqual(['Active']); // Other fields unchanged
    expect(updated).not.toBe(original); // Different reference
  });

  it('clearAllFilters returns same structure as EMPTY_FILTER_STATE', () => {
    const { EMPTY_FILTER_STATE } = require('../filterUtils');
    const cleared = clearAllFilters();
    expect(cleared).toEqual(EMPTY_FILTER_STATE);
    expect(Object.keys(cleared)).toEqual(Object.keys(EMPTY_FILTER_STATE));
  });

  it('handleFilterChange handles unknown category gracefully', () => {
    const base = {
      tags: ['Owner'],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    } as any;

    const result = handleFilterChange(base, 'unknownField' as any, 'value');
    expect(result.unknownField).toEqual(['value']);
    expect(result.tags).toEqual(['Owner']); // Existing fields preserved
  });

  it('getUniqueValues handles empty array', () => {
    expect(getUniqueLastNames([])).toEqual([]);
    expect(getUniqueFirstNames([])).toEqual([]);
    expect(getUniqueTags([])).toEqual([]);
  });

  it('getUniqueValues handles duplicate values', () => {
    const clientsWithDuplicates: Client[] = [
      { ...baseClient, id: '1', last_name: 'Kim' },
      { ...baseClient, id: '2', last_name: 'Kim' },
      { ...baseClient, id: '3', last_name: 'Lee' },
      { ...baseClient, id: '4', last_name: 'Kim' },
    ];

    const unique = getUniqueLastNames(clientsWithDuplicates);
    expect(unique).toEqual(['Kim', 'Lee']);
    expect(unique.length).toBe(2);
  });

  it('getUniqueTags flattens nested arrays correctly', () => {
    const clients: Client[] = [
      { ...baseClient, id: '1', tags: ['Owner', 'Musician'] },
      { ...baseClient, id: '2', tags: ['Musician', 'Dealer'] },
      { ...baseClient, id: '3', tags: ['Collector'] },
      { ...baseClient, id: '4', tags: [] },
    ];

    const uniqueTags = getUniqueTags(clients);
    expect(uniqueTags).toEqual(['Owner', 'Musician', 'Dealer', 'Collector']);
    expect(uniqueTags.length).toBe(4);
  });

  it('handleColumnSort maintains sortBy when toggling same column', () => {
    const result1 = handleColumnSort('last_name', 'asc', 'last_name');
    expect(result1.sortBy).toBe('last_name');
    expect(result1.sortOrder).toBe('desc');

    const result2 = handleColumnSort('last_name', 'desc', 'last_name');
    expect(result2.sortBy).toBe('last_name');
    expect(result2.sortOrder).toBe('asc');
  });

  it('handleColumnSort resets to asc when changing column', () => {
    const result = handleColumnSort('last_name', 'desc', 'first_name');
    expect(result.sortBy).toBe('first_name');
    expect(result.sortOrder).toBe('asc');
  });

  it('getSortArrow returns correct values for all states', () => {
    // Not sorted
    expect(getSortArrow('first_name', 'asc', 'last_name')).toBe('sort-neutral');

    // Sorted ascending
    expect(getSortArrow('last_name', 'asc', 'last_name')).toBe('sort-asc');

    // Sorted descending
    expect(getSortArrow('last_name', 'desc', 'last_name')).toBe('sort-desc');
  });

  it('handleFilterChange preserves other fields when updating one', () => {
    const state = {
      tags: ['Owner'],
      interest: ['Active'],
      last_name: ['Doe'],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const updated = handleFilterChange(state, 'tags', 'Musician');
    expect(updated.tags).toEqual(['Owner', 'Musician']);
    expect(updated.interest).toEqual(['Active']);
    expect(updated.last_name).toEqual(['Doe']);
  });

  it('handleFilterChange handles empty string values', () => {
    const state = {
      tags: [],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const updated = handleFilterChange(state, 'tags', '');
    expect(updated.tags).toEqual(['']);
  });

  it('clearAllFilters always returns consistent structure', () => {
    const first = clearAllFilters();
    const second = clearAllFilters();
    const third = clearAllFilters();

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(Object.keys(first).sort()).toEqual([
      'contact_number',
      'email',
      'first_name',
      'hasInstruments',
      'interest',
      'last_name',
      'tags',
    ]);
  });

  it('getUniqueValues filters out null and undefined', () => {
    const clientsWithNulls: Client[] = [
      { ...baseClient, id: '1', last_name: 'Kim', first_name: 'John' },
      { ...baseClient, id: '2', last_name: null, first_name: 'Jane' },
      { ...baseClient, id: '3', last_name: 'Lee', first_name: null },
      {
        ...baseClient,
        id: '4',
        last_name: undefined as any,
        first_name: 'Bob',
      },
    ];

    const lastNames = getUniqueLastNames(clientsWithNulls);
    expect(lastNames).toEqual(['Kim', 'Lee']);
    expect(lastNames).not.toContain(null);
    expect(lastNames).not.toContain(undefined);
  });

  it('getUniqueValues returns empty array for clients with only nulls', () => {
    const onlyNulls: Client[] = [
      { ...baseClient, id: '1', last_name: null, first_name: null },
      { ...baseClient, id: '2', last_name: null, first_name: null },
    ];

    expect(getUniqueLastNames(onlyNulls)).toEqual([]);
    expect(getUniqueFirstNames(onlyNulls)).toEqual([]);
  });

  it('getUniqueTags handles clients with empty tag arrays', () => {
    const clientsWithEmptyTags: Client[] = [
      { ...baseClient, id: '1', tags: [] },
      { ...baseClient, id: '2', tags: ['Owner'] },
      { ...baseClient, id: '3', tags: [] },
    ];

    const tags = getUniqueTags(clientsWithEmptyTags);
    expect(tags).toEqual(['Owner']);
  });

  it('handleFilterChange maintains array order', () => {
    let state = {
      tags: [],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    // 순서대로 추가
    state = handleFilterChange(state, 'tags', 'A') as typeof state;
    state = handleFilterChange(state, 'tags', 'B') as typeof state;
    state = handleFilterChange(state, 'tags', 'C') as typeof state;

    expect(state.tags).toEqual(['A', 'B', 'C']);
  });

  it('handleFilterChange removes correct item when multiple exist', () => {
    const state = {
      tags: ['A', 'B', 'C', 'D'],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const updated = handleFilterChange(state, 'tags', 'B');
    expect(updated.tags).toEqual(['A', 'C', 'D']);
    expect(updated.tags).not.toContain('B');
  });

  it('handleColumnSort handles same column toggle multiple times', () => {
    let sortState: { sortBy: string; sortOrder: 'asc' | 'desc' } = {
      sortBy: 'last_name',
      sortOrder: 'asc',
    };

    // 첫 토글
    sortState = handleColumnSort(
      sortState.sortBy,
      sortState.sortOrder,
      'last_name'
    );
    expect(sortState.sortOrder).toBe('desc');

    // 두 번째 토글
    sortState = handleColumnSort(
      sortState.sortBy,
      sortState.sortOrder,
      'last_name'
    );
    expect(sortState.sortOrder).toBe('asc');

    // 세 번째 토글
    sortState = handleColumnSort(
      sortState.sortBy,
      sortState.sortOrder,
      'last_name'
    );
    expect(sortState.sortOrder).toBe('desc');
  });

  it('getSortArrow handles all column combinations', () => {
    // 현재 정렬되지 않은 컬럼
    expect(getSortArrow('first_name', 'asc', 'last_name')).toBe('sort-neutral');
    expect(getSortArrow('first_name', 'desc', 'last_name')).toBe(
      'sort-neutral'
    );

    // 현재 정렬된 컬럼
    expect(getSortArrow('first_name', 'asc', 'first_name')).toBe('sort-asc');
    expect(getSortArrow('first_name', 'desc', 'first_name')).toBe('sort-desc');
  });

  it('handleFilterChange works with hasInstruments field', () => {
    const state = {
      tags: [],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const withHas = handleFilterChange(
      state,
      'hasInstruments',
      'Has Instruments'
    );
    expect(withHas.hasInstruments).toEqual(['Has Instruments']);

    const removed = handleFilterChange(
      withHas,
      'hasInstruments',
      'Has Instruments'
    );
    expect(removed.hasInstruments).toEqual([]);
  });

  it('getUniqueValues preserves string case', () => {
    const clientsWithCase: Client[] = [
      { ...baseClient, id: '1', last_name: 'Smith' },
      { ...baseClient, id: '2', last_name: 'smith' },
      { ...baseClient, id: '3', last_name: 'SMITH' },
    ];

    const unique = getUniqueLastNames(clientsWithCase);
    // 대소문자를 구분하므로 모두 다르게 취급됨
    expect(unique.length).toBe(3);
    expect(unique).toContain('Smith');
    expect(unique).toContain('smith');
    expect(unique).toContain('SMITH');
  });

  it('handleFilterChange handles special characters in values', () => {
    const state = {
      tags: [],
      interest: [],
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      hasInstruments: [],
    };

    const withSpecial = handleFilterChange(state, 'tags', 'Tag@#$%');
    expect(withSpecial.tags).toEqual(['Tag@#$%']);

    const removed = handleFilterChange(withSpecial, 'tags', 'Tag@#$%');
    expect(removed.tags).toEqual([]);
  });
});
