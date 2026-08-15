/**
 * Unit tests for the canonical clients collection list query helpers.
 */
import { NextRequest } from 'next/server';
import {
  buildClientsCollectionQueryString,
  buildClientsListPayload,
  parseClientsListQuery,
  runClientsListQuery,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_ALL_LIMIT,
} from '../listQuery';

describe('parseClientsListQuery', () => {
  it('defaults to bounded page 1', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients')
    );
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(q.paged).toBe(true);
    expect(q.all).toBe(false);
    expect(q.rangeStart).toBe(0);
    expect(q.rangeEnd).toBe(DEFAULT_PAGE_SIZE - 1);
  });

  it('accepts page_size alias and sort_by / sort_direction', () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?page=3&page_size=50&sort_by=name&sort_direction=asc'
      )
    );
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
    expect(q.orderBy).toBe('name');
    expect(q.ascending).toBe(true);
    expect(q.rangeStart).toBe(100);
    expect(q.rangeEnd).toBe(149);
  });

  it('clamps pageSize to maximum', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?pageSize=999')
    );
    expect(q.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('normalizes invalid page to 1', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?page=0&pageSize=abc')
    );
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('treats whitespace-only search as no search', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?search=%20%20')
    );
    expect(q.search).toBeUndefined();
  });

  it('sanitizes PostgREST-breaking search characters', () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?search=' +
          encodeURIComponent('a%,_(x)\'"\\')
      )
    );
    expect(q.search).toBeDefined();
    expect(q.search).not.toMatch(/[%_(),'"\\]/);
  });

  it('parses multi-value filters and hasInstruments', () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?last_name=Doe&last_name=Smith&tags=Owner&tags=Musician&hasInstruments=has&interest=Active'
      )
    );
    expect(q.lastNames).toEqual(['Doe', 'Smith']);
    expect(q.tags).toEqual(['Owner', 'Musician']);
    expect(q.interests).toEqual(['Active']);
    expect(q.hasInstruments).toBe('has');
  });

  it('bounds all=true to the internal directory cap', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?all=true')
    );
    expect(q.all).toBe(true);
    expect(q.paged).toBe(false);
    expect(q.pageSize).toBe(MAX_ALL_LIMIT);
  });
});

describe('buildClientsListPayload', () => {
  const baseQ = parseClientsListQuery(
    new NextRequest('http://localhost/api/clients?page=2&pageSize=20')
  );

  it('reports has_more from total vs page window', () => {
    const { payloadMeta } = buildClientsListPayload([], 41, baseQ);
    expect(payloadMeta.pagination.totalPages).toBe(3);
    expect(payloadMeta.has_more).toBe(true);
    expect(payloadMeta.truncated).toBe(false);
  });

  it('handles empty organization', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?page=1&pageSize=20')
    );
    const { payloadMeta } = buildClientsListPayload([], 0, q);
    expect(payloadMeta.pagination.totalPages).toBe(1);
    expect(payloadMeta.has_more).toBe(false);
  });

  it('marks all=true overflow as truncated', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?all=true')
    );
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: String(i) }));
    const { rows: out, payloadMeta } = buildClientsListPayload(rows, 1001, q);
    expect(out).toHaveLength(1000);
    expect(payloadMeta.truncated).toBe(true);
    expect(payloadMeta.has_more).toBe(true);
    expect(payloadMeta.scope).toBe('all');
  });

  it('exact page size plus one yields two pages', () => {
    const q = parseClientsListQuery(
      new NextRequest('http://localhost/api/clients?page=1&pageSize=20')
    );
    const { payloadMeta } = buildClientsListPayload(
      Array.from({ length: 20 }, () => ({})),
      21,
      q
    );
    expect(payloadMeta.pagination.totalPages).toBe(2);
    expect(payloadMeta.has_more).toBe(true);
  });
});

describe('buildClientsCollectionQueryString', () => {
  it('encodes collection params without all=true', () => {
    const qs = buildClientsCollectionQueryString({
      page: 2,
      pageSize: 20,
      search: 'Ann',
      orderBy: 'created_at',
      ascending: false,
      tags: ['Owner'],
      hasInstruments: 'has',
    });
    expect(qs).toContain('page=2');
    expect(qs).toContain('pageSize=20');
    expect(qs).toContain('search=Ann');
    expect(qs).toContain('ascending=false');
    expect(qs).toContain('tags=Owner');
    expect(qs).toContain('hasInstruments=has');
    expect(qs).not.toContain('all=true');
  });
});

describe('client sort contract', () => {
  it('maps legacy name and phone aliases to canonical server fields', () => {
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?sortBy=first_name')
      ).orderBy
    ).toBe('name');
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?orderBy=last_name')
      ).orderBy
    ).toBe('name');
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?sort_by=contact_number')
      ).orderBy
    ).toBe('phone');
  });

  it('accepts email, interest, and client_number as supported sorts', () => {
    expect(
      parseClientsListQuery(
        new NextRequest(
          'http://localhost/api/clients?orderBy=email&sort_direction=desc'
        )
      )
    ).toMatchObject({ orderBy: 'email', ascending: false });
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?sortBy=interest')
      ).orderBy
    ).toBe('interest');
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?orderBy=client_number')
      ).orderBy
    ).toBe('client_number');
  });

  it('normalizes invalid and display-only sort keys to created_at', () => {
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?sortBy=tags')
      ).orderBy
    ).toBe('created_at');
    expect(
      parseClientsListQuery(
        new NextRequest('http://localhost/api/clients?sortBy=not_a_column')
      ).orderBy
    ).toBe('created_at');
  });
});

type ClientKeyRow = {
  id: string;
  client_number: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  tags?: string[];
  interest?: string | null;
};

function createClientsSupabaseMock(rows: ClientKeyRow[]) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'client_instruments') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({
            data: rows
              .filter(row => row.client_number !== 'CL11')
              .map(row => ({ client_id: row.id })),
            error: null,
          }),
        };
      }

      let mode: 'keys' | 'full' = 'full';
      let rangeStart = 0;
      let rangeEnd = rows.length - 1;
      let inIds: string[] | null = null;
      let search: string | null = null;

      const builder: {
        select: jest.Mock;
        eq: jest.Mock;
        or: jest.Mock;
        in: jest.Mock;
        not: jest.Mock;
        contains: jest.Mock;
        order: jest.Mock;
        range: jest.Mock;
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise<unknown>;
      } = {
        select: jest.fn((cols: string) => {
          mode = cols.includes('created_at') ? 'full' : 'keys';
          return builder;
        }),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn((clause: string) => {
          const match = clause.match(/%([^%]+)%/);
          search = match ? match[1] : clause;
          return builder;
        }),
        in: jest.fn((column: string, ids: string[]) => {
          if (column === 'id') inIds = ids;
          return builder;
        }),
        not: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn((start: number, end: number) => {
          rangeStart = start;
          rangeEnd = end;
          return builder;
        }),
        then(resolve, reject) {
          try {
            let filtered = [...rows];
            if (search) {
              const needle = search.toLowerCase();
              filtered = filtered.filter(row =>
                `${row.name ?? ''} ${row.email ?? ''} ${row.client_number ?? ''}`
                  .toLowerCase()
                  .includes(needle)
              );
            }
            if (inIds) {
              filtered = filtered.filter(row => inIds!.includes(row.id));
            }

            if (mode === 'keys') {
              const keys = filtered.map(row => ({
                id: row.id,
                client_number: row.client_number,
              }));
              const page = keys.slice(rangeStart, rangeEnd + 1);
              return Promise.resolve(
                resolve({ data: page, error: null, count: keys.length })
              );
            }

            return Promise.resolve(
              resolve({ data: filtered, error: null, count: filtered.length })
            );
          } catch (error) {
            return Promise.reject(reject ? reject(error) : error);
          }
        },
      };

      return builder;
    }),
  };
}

describe('runClientsListQuery numeric client_number', () => {
  const dataset: ClientKeyRow[] = [
    { id: 'id-10', client_number: 'CL10', name: 'Ten', email: 'ten@x.com' },
    { id: 'id-1', client_number: 'CL1', name: 'One', email: 'one@x.com' },
    {
      id: 'id-11',
      client_number: 'CL11',
      name: 'Eleven',
      email: 'eleven@x.com',
    },
    { id: 'id-2', client_number: 'CL2', name: 'Two', email: 'two@x.com' },
  ];

  it('N5: numeric ordering is applied before page slicing', async () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=client_number&ascending=true&page=1&pageSize=2'
      )
    );
    const { data, count } = await runClientsListQuery(
      createClientsSupabaseMock(dataset) as never,
      q,
      'org-1'
    );

    expect(count).toBe(4);
    expect((data as ClientKeyRow[]).map(row => row.client_number)).toEqual([
      'CL1',
      'CL2',
    ]);

    const page2 = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=client_number&ascending=true&page=2&pageSize=2'
      )
    );
    const second = await runClientsListQuery(
      createClientsSupabaseMock(dataset) as never,
      page2,
      'org-1'
    );
    expect(
      (second.data as ClientKeyRow[]).map(row => row.client_number)
    ).toEqual(['CL10', 'CL11']);
  });

  it('N4/N8: mixed padding and malformed values stay globally numeric', async () => {
    const mixed: ClientKeyRow[] = [
      { id: 'id-1000', client_number: 'CL1000' },
      { id: 'id-legacy', client_number: 'mj123' },
      { id: 'id-002', client_number: 'CL002' },
      { id: 'id-1', client_number: 'CL1' },
      { id: 'id-null', client_number: null },
      { id: 'id-10', client_number: 'CL10' },
    ];
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=client_number&ascending=true&pageSize=20'
      )
    );
    const { data, count } = await runClientsListQuery(
      createClientsSupabaseMock(mixed) as never,
      q,
      'org-1'
    );

    expect(count).toBe(6);
    expect((data as ClientKeyRow[]).map(row => row.client_number)).toEqual([
      'CL1',
      'CL002',
      'CL10',
      'CL1000',
      'mj123',
      null,
    ]);
  });

  it('N6: filter + numeric sort stays inside the filtered set', async () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=client_number&ascending=true&hasInstruments=has&pageSize=20'
      )
    );
    const { data, count } = await runClientsListQuery(
      createClientsSupabaseMock(dataset) as never,
      q,
      'org-1'
    );

    expect(count).toBe(3);
    expect((data as ClientKeyRow[]).map(row => row.client_number)).toEqual([
      'CL1',
      'CL2',
      'CL10',
    ]);
  });

  it('N7: search + numeric sort stays inside the searched set', async () => {
    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=client_number&ascending=true&search=one&pageSize=20'
      )
    );
    const { data, count } = await runClientsListQuery(
      createClientsSupabaseMock(dataset) as never,
      q,
      'org-1'
    );

    expect(count).toBe(1);
    expect((data as ClientKeyRow[]).map(row => row.client_number)).toEqual([
      'CL1',
    ]);
  });

  it('N10: ordinary name/email/phone sorts still use PostgREST order', async () => {
    const orders: Array<{ column: string; ascending: boolean }> = [];
    const builder: {
      select: jest.Mock;
      eq: jest.Mock;
      or: jest.Mock;
      order: jest.Mock;
      range: jest.Mock;
    } = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn((column: string, opts: { ascending: boolean }) => {
        orders.push({ column, ascending: opts.ascending });
        return builder;
      }),
      range: jest.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      }),
    };
    const supabase = { from: jest.fn(() => builder) };

    const q = parseClientsListQuery(
      new NextRequest(
        'http://localhost/api/clients?orderBy=email&sort_direction=asc'
      )
    );
    await runClientsListQuery(supabase as never, q, 'org-1');

    expect(orders).toEqual([
      { column: 'email', ascending: true },
      { column: 'id', ascending: true },
    ]);
    expect(builder.range).toHaveBeenCalledWith(0, DEFAULT_PAGE_SIZE - 1);
  });
});
