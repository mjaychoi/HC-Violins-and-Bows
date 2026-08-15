import {
  CLIENT_LIST_COLUMNS,
  canonicalizeClientSortField,
  clientSortArrow,
  compareClientNumberKeys,
  parseClClientNumberSuffix,
  sortClientNumberKeys,
} from '../clientSort';

describe('canonicalizeClientSortField', () => {
  it('defaults missing or invalid keys to created_at', () => {
    expect(canonicalizeClientSortField(null)).toBe('created_at');
    expect(canonicalizeClientSortField('')).toBe('created_at');
    expect(canonicalizeClientSortField('tags')).toBe('created_at');
    expect(canonicalizeClientSortField('not_a_field')).toBe('created_at');
  });

  it('maps legacy name and phone aliases to canonical server fields', () => {
    expect(canonicalizeClientSortField('first_name')).toBe('name');
    expect(canonicalizeClientSortField('last_name')).toBe('name');
    expect(canonicalizeClientSortField('contact_number')).toBe('phone');
  });

  it('accepts supported canonical fields', () => {
    expect(canonicalizeClientSortField('name')).toBe('name');
    expect(canonicalizeClientSortField('phone')).toBe('phone');
    expect(canonicalizeClientSortField('email')).toBe('email');
    expect(canonicalizeClientSortField('interest')).toBe('interest');
    expect(canonicalizeClientSortField('client_number')).toBe('client_number');
  });
});

describe('CLIENT_LIST_COLUMNS', () => {
  it('exposes sort only for server-supported visible fields', () => {
    const sortable = CLIENT_LIST_COLUMNS.filter(column => column.sortable).map(
      column => column.field
    );
    const displayOnly = CLIENT_LIST_COLUMNS.filter(
      column => !column.sortable
    ).map(column => column.field);

    expect(sortable).toEqual(['name', 'phone', 'interest', 'client_number']);
    expect(displayOnly).toEqual(['tags']);
  });
});

describe('clientSortArrow', () => {
  it('aligns alias and canonical keys to the same semantic arrow', () => {
    expect(clientSortArrow('first_name', 'asc', 'name')).toBe('↑');
    expect(clientSortArrow('name', 'desc', 'first_name')).toBe('↓');
    expect(clientSortArrow('contact_number', 'asc', 'phone')).toBe('↑');
    expect(clientSortArrow('phone', 'asc', 'name')).toBe('');
    expect(clientSortArrow('created_at', 'desc', 'name')).toBe('');
  });

  it('does not show an arrow for an invalid requested field after normalization', () => {
    expect(clientSortArrow('tags', 'asc', 'tags')).toBe('');
    expect(clientSortArrow('not_a_field', 'desc', 'not_a_field')).toBe('');
  });
});

describe('parseClClientNumberSuffix', () => {
  it('parses mixed padding and case', () => {
    expect(parseClClientNumberSuffix('CL1')).toBe(1);
    expect(parseClClientNumberSuffix('CL002')).toBe(2);
    expect(parseClClientNumberSuffix('cl10')).toBe(10);
    expect(parseClClientNumberSuffix('CL099')).toBe(99);
    expect(parseClClientNumberSuffix('CL1000')).toBe(1000);
  });

  it('returns null for malformed, empty, or null values', () => {
    expect(parseClClientNumberSuffix(null)).toBeNull();
    expect(parseClClientNumberSuffix('')).toBeNull();
    expect(parseClClientNumberSuffix('mj123')).toBeNull();
    expect(parseClClientNumberSuffix('CL-1')).toBeNull();
    expect(parseClClientNumberSuffix('CL001a')).toBeNull();
  });
});

describe('numeric Client Number ordering', () => {
  const row = (id: string, client_number: string | null) => ({
    id,
    client_number,
  });

  it('N1: CL1 < CL2 < CL10 ascending', () => {
    const sorted = sortClientNumberKeys(
      [row('c', 'CL10'), row('a', 'CL1'), row('b', 'CL2')],
      true
    ).map(item => item.client_number);
    expect(sorted).toEqual(['CL1', 'CL2', 'CL10']);
  });

  it('N2: same values descending', () => {
    const sorted = sortClientNumberKeys(
      [row('a', 'CL1'), row('b', 'CL2'), row('c', 'CL10')],
      false
    ).map(item => item.client_number);
    expect(sorted).toEqual(['CL10', 'CL2', 'CL1']);
  });

  it('N3: CL099 < CL100 < CL1000', () => {
    const sorted = sortClientNumberKeys(
      [row('c', 'CL1000'), row('a', 'CL099'), row('b', 'CL100')],
      true
    ).map(item => item.client_number);
    expect(sorted).toEqual(['CL099', 'CL100', 'CL1000']);
  });

  it('N4: mixed zero padding CL1 / CL002 / CL10', () => {
    const sorted = sortClientNumberKeys(
      [row('c', 'CL10'), row('a', 'CL1'), row('b', 'CL002')],
      true
    ).map(item => item.client_number);
    expect(sorted).toEqual(['CL1', 'CL002', 'CL10']);
  });

  it('orders CL999 before CL1000', () => {
    const sorted = sortClientNumberKeys(
      [row('b', 'CL1000'), row('a', 'CL999')],
      true
    ).map(item => item.client_number);
    expect(sorted).toEqual(['CL999', 'CL1000']);
  });

  it('N8: malformed and null values sort after valid numbers without crashing', () => {
    const sorted = sortClientNumberKeys(
      [
        row('d', null),
        row('e', ''),
        row('c', 'mj123'),
        row('b', 'CL10'),
        row('a', 'CL1'),
      ],
      true
    );
    expect(sorted.map(item => item.client_number)).toEqual([
      'CL1',
      'CL10',
      'mj123',
      '',
      null,
    ]);
  });

  it('uses stable id secondary ordering for identical numeric suffixes', () => {
    const sorted = sortClientNumberKeys(
      [row('uuid-b', 'CL001'), row('uuid-a', 'CL1')],
      true
    );
    expect(sorted.map(item => item.id)).toEqual(['uuid-a', 'uuid-b']);
    expect(
      compareClientNumberKeys(
        row('uuid-b', 'CL001'),
        row('uuid-a', 'CL1'),
        true
      )
    ).toBeGreaterThan(0);
  });

  it('does not rewrite client number values', () => {
    const original = [row('a', 'CL002'), row('b', 'CL10')];
    const sorted = sortClientNumberKeys(original, true);
    expect(sorted[0].client_number).toBe('CL002');
    expect(original[0].client_number).toBe('CL002');
  });
});
