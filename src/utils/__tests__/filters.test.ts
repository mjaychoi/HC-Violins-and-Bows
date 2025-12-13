import { buildFilterOptions, buildFilterOptionsFromField, buildFilterOptionsFromArrayField, buildMultiFieldFilterOptions, sortByPriority } from '../filters';

type Item = {
  id: string;
  status?: string | null;
  tags?: string[] | null;
  score?: number | null;
};

const items: Item[] = [
  { id: '1', status: 'High', tags: ['A', 'B'] },
  { id: '2', status: 'Low', tags: ['B', 'C'] },
  { id: '3', status: null, tags: null },
];

describe('filters utils', () => {
  it('buildFilterOptions extracts unique values with extractor', () => {
    const result = buildFilterOptions(items, {
      status: { field: 'status' },
      tags: {
        field: 'tags' as any,
        extractor: (item: Item) => item.tags,
      },
    });
    expect(result.status).toEqual(['High', 'Low']);
    expect(result.tags).toEqual(['A', 'B', 'C']);
  });

  it('buildFilterOptions honors custom sortFn', () => {
    const result = buildFilterOptions(items, {
      status: {
        field: 'status',
        sortFn: (a, b) => (a as string).length - (b as string).length,
      },
    });
    expect(result.status).toEqual(['Low', 'High']);
  });

  it('buildFilterOptionsFromField uses unique values', () => {
    const vals = buildFilterOptionsFromField(items, 'status');
    expect(vals).toEqual(['High', 'Low']);
  });

  it('buildFilterOptionsFromArrayField flattens arrays', () => {
    const vals = buildFilterOptionsFromArrayField(items, 'tags');
    expect(vals).toEqual(['A', 'B', 'C']);
  });

  it('buildMultiFieldFilterOptions handles multiple fields', () => {
    const vals = buildMultiFieldFilterOptions(items, ['status', 'id']);
    expect(vals.status).toEqual(['High', 'Low']);
    expect(vals.id).toEqual(['1', '2', '3']);
  });

  it('sortByPriority sorts by provided mapping', () => {
    const ordered = sortByPriority(['low', 'medium', 'high'] as const, {
      high: 3,
      medium: 2,
      low: 1,
    });
    expect(ordered).toEqual(['high', 'medium', 'low']);
  });
});
