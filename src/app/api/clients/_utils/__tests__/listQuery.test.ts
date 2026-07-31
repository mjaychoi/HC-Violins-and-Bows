/**
 * Unit tests for the canonical clients collection list query helpers.
 */
import { NextRequest } from 'next/server';
import {
  buildClientsCollectionQueryString,
  buildClientsListPayload,
  parseClientsListQuery,
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
