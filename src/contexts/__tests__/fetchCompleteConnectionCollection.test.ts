import type { ClientInstrument } from '@/types';
import {
  CONNECTIONS_COMPLETE_PAGE_SIZE,
  ConnectionCompleteFetchCancelled,
  ConnectionCompleteFetchError,
  fetchCompleteConnectionCollection,
} from '../fetchCompleteConnectionCollection';

function row(id: string, createdAt = '2024-01-01T00:00:00Z'): ClientInstrument {
  return {
    id,
    client_id: `client-${id}`,
    instrument_id: `instrument-${id}`,
    relationship_type: 'Interested',
    notes: null,
    created_at: createdAt,
  };
}

function pageEnvelope(args: {
  rows: ClientInstrument[];
  page: number;
  pageSize?: number;
  totalCount: number;
  totalPages: number;
}) {
  const pageSize = args.pageSize ?? CONNECTIONS_COMPLETE_PAGE_SIZE;

  return {
    data: args.rows,
    count: args.totalCount,
    page: args.page,
    pageSize,
    totalPages: args.totalPages,
    truncated: false,
    pagination: {
      page: args.page,
      pageSize,
      totalCount: args.totalCount,
      totalPages: args.totalPages,
    },
  };
}

describe('fetchCompleteConnectionCollection', () => {
  it('returns an empty complete collection', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      pageEnvelope({
        rows: [],
        page: 1,
        totalCount: 0,
        totalPages: 1,
      })
    );

    const result = await fetchCompleteConnectionCollection({ fetchPage });

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, CONNECTIONS_COMPLETE_PAGE_SIZE);
  });

  it('returns a one-page org in created_at DESC order', async () => {
    const newer = row('b', '2024-02-01T00:00:00Z');
    const older = row('a', '2024-01-01T00:00:00Z');
    const fetchPage = jest.fn().mockResolvedValue(
      pageEnvelope({
        rows: [newer, older],
        page: 1,
        totalCount: 2,
        totalPages: 1,
      })
    );

    const result = await fetchCompleteConnectionCollection({ fetchPage });

    expect(result.map(item => item.id)).toEqual(['b', 'a']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('drains every page into a unique created_at DESC collection', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) =>
      row(
        `p1-${index}`,
        new Date(Date.UTC(2024, 2, 1, 12, 0, index)).toISOString()
      )
    );
    const page2 = Array.from({ length: 100 }, (_, index) =>
      row(
        `p2-${index}`,
        new Date(Date.UTC(2024, 1, 1, 12, 0, index)).toISOString()
      )
    );
    const page3 = Array.from({ length: 37 }, (_, index) =>
      row(
        `p3-${index}`,
        new Date(Date.UTC(2024, 0, 1, 12, 0, index)).toISOString()
      )
    );
    const fetchPage = jest.fn(async (page: number) => {
      if (page === 1) {
        return pageEnvelope({
          rows: page1,
          page: 1,
          totalCount: 237,
          totalPages: 3,
        });
      }
      if (page === 2) {
        return pageEnvelope({
          rows: page2,
          page: 2,
          totalCount: 237,
          totalPages: 3,
        });
      }
      return pageEnvelope({
        rows: page3,
        page: 3,
        totalCount: 237,
        totalPages: 3,
      });
    });

    const result = await fetchCompleteConnectionCollection({ fetchPage });
    const ids = result.map(item => item.id);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(ids).toHaveLength(237);
    expect(new Set(ids).size).toBe(237);
    expect(ids).toContain('p3-36');
    expect(ids[0]).toBe('p1-99');
  });

  it('dedupes repeated ids at a page boundary without hiding unique rows', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => row(`p1-${index}`));
    const overlap = page1[99];
    const page2Unique = Array.from({ length: 50 }, (_, index) =>
      row(`p2-${index}`)
    );
    const fetchPage = jest.fn(async (page: number) => {
      if (page === 1) {
        return pageEnvelope({
          rows: page1,
          page: 1,
          totalCount: 150,
          totalPages: 2,
        });
      }
      return pageEnvelope({
        rows: [overlap, ...page2Unique],
        page: 2,
        totalCount: 150,
        totalPages: 2,
      });
    });

    const result = await fetchCompleteConnectionCollection({ fetchPage });
    const ids = result.map(item => item.id);

    expect(ids).toHaveLength(150);
    expect(new Set(ids).size).toBe(150);
  });

  it('retrieves a collection larger than the old 1000-row all=true cap', async () => {
    const fetchPage = jest.fn(async (page: number) => {
      const start = (page - 1) * 100;
      const remaining = 1001 - start;
      const rows = Array.from(
        { length: Math.min(100, remaining) },
        (_, index) => row(`cap-${start + index}`)
      );

      return pageEnvelope({
        rows,
        page,
        totalCount: 1001,
        totalPages: 11,
      });
    });

    const result = await fetchCompleteConnectionCollection({ fetchPage });

    expect(result).toHaveLength(1001);
    expect(fetchPage).toHaveBeenCalledTimes(11);
    expect(result[result.length - 1]?.id).toBe('cap-0');
  });

  it('fails the whole drain when a later page is malformed', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(
        pageEnvelope({
          rows: Array.from({ length: 100 }, (_, index) => row(`a-${index}`)),
          page: 1,
          totalCount: 150,
          totalPages: 2,
        })
      )
      .mockResolvedValueOnce({ data: { not: 'an-array' } });

    await expect(
      fetchCompleteConnectionCollection({ fetchPage })
    ).rejects.toBeInstanceOf(ConnectionCompleteFetchError);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('fails when totalPages changes mid-drain', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(
        pageEnvelope({
          rows: Array.from({ length: 100 }, (_, index) => row(`a-${index}`)),
          page: 1,
          totalCount: 150,
          totalPages: 2,
        })
      )
      .mockResolvedValueOnce(
        pageEnvelope({
          rows: Array.from({ length: 50 }, (_, index) => row(`b-${index}`)),
          page: 2,
          totalCount: 150,
          totalPages: 4,
        })
      );

    await expect(
      fetchCompleteConnectionCollection({ fetchPage })
    ).rejects.toThrow('totalPages changed');
  });

  it('fails when a later page repeats with no new ids before the drain is complete', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) =>
      row(`same-${index}`)
    );
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(
        pageEnvelope({
          rows: page1,
          page: 1,
          totalCount: 250,
          totalPages: 3,
        })
      )
      .mockResolvedValueOnce(
        pageEnvelope({
          rows: page1,
          page: 2,
          totalCount: 250,
          totalPages: 3,
        })
      );

    await expect(
      fetchCompleteConnectionCollection({ fetchPage })
    ).rejects.toThrow('no progress');
  });

  it('fails when zero rows are returned while metadata claims more', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      pageEnvelope({
        rows: [],
        page: 1,
        totalCount: 3,
        totalPages: 1,
      })
    );

    await expect(
      fetchCompleteConnectionCollection({ fetchPage })
    ).rejects.toThrow('zero rows');
  });

  it('aborts before committing when cancelled after page 1', async () => {
    let cancelled = false;
    const fetchPage = jest.fn(async (page: number) => {
      if (page === 1) {
        cancelled = true;
        return pageEnvelope({
          rows: Array.from({ length: 100 }, (_, index) => row(`a-${index}`)),
          page: 1,
          totalCount: 150,
          totalPages: 2,
        });
      }

      throw new Error('page 2 should not be requested');
    });

    await expect(
      fetchCompleteConnectionCollection({
        fetchPage,
        isCancelled: () => cancelled,
      })
    ).rejects.toBeInstanceOf(ConnectionCompleteFetchCancelled);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
