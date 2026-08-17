import { act, renderHook } from '@/test-utils/render';
import {
  InstrumentsProvider,
  useInstruments,
  useInstrumentsContext,
} from '../InstrumentsContext';
import { apiFetch } from '@/utils/apiFetch';
import type { Instrument } from '@/types';

jest.mock('@/utils/apiFetch', () => {
  const actual =
    jest.requireActual<typeof import('@/utils/apiFetch')>('@/utils/apiFetch');
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

let mockAccessScopeKey: string | null =
  'user-1:org-1:2024-01-01T00:00:00Z:admin:1';

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'user-1:org-1:2024-01-01T00:00:00Z',
    accessScopeKey: mockAccessScopeKey,
    isTenantTransitioning: mockAccessScopeKey === null,
  })),
}));

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({ handleError: jest.fn() }),
  };
});

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const ORG_A_SCOPE = 'user-1:org-1:2024-01-01T00:00:00Z:admin:1';
const ORG_B_SCOPE = 'user-1:org-2:2024-01-01T00:00:00Z:admin:1';

const item: Instrument = {
  id: 'item-1',
  maker: 'M',
  type: 'Violin',
  subtype: null,
  serial_number: 'VI0000999',
  year: 2020,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: null,
  certificate: false,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
};

function envelopeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const truncatedAllTrueBody = {
  data: [item],
  count: 1237,
  pagination: {
    page: 1,
    pageSize: 1000,
    totalCount: 1237,
    totalPages: 1,
  },
  scope: 'all',
  truncated: true,
};

describe('InstrumentsContext collection completeness metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessScopeKey = ORG_A_SCOPE;
  });

  it('preserves authoritative total, loaded count, and truncation from all=true', async () => {
    mockApiFetch.mockResolvedValue(envelopeResponse(truncatedAllTrueBody));

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });

    expect(result.current.allResultsTruncated).toBe(true);
    expect(result.current.allResultsTotalCount).toBe(1237);
    expect(result.current.allResultsLoadedCount).toBe(1);
    expect(result.current.allResultsTotalCount).not.toBe(
      result.current.instruments.length
    );
    expect(result.current.instruments).toHaveLength(1);
  });

  it('prefers pagination.totalCount over count', async () => {
    mockApiFetch.mockResolvedValue(
      envelopeResponse({
        ...truncatedAllTrueBody,
        count: 9999,
        pagination: {
          ...truncatedAllTrueBody.pagination,
          totalCount: 1237,
        },
      })
    );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });

    expect(result.current.allResultsTotalCount).toBe(1237);
  });

  it('fails closed to null total when truncated metadata is malformed', async () => {
    mockApiFetch.mockResolvedValue(
      envelopeResponse({
        data: [item],
        count: '1237',
        pagination: { totalCount: Number.NaN },
        truncated: true,
      })
    );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });

    expect(result.current.allResultsTruncated).toBe(true);
    expect(result.current.allResultsTotalCount).toBeNull();
    expect(result.current.allResultsLoadedCount).toBe(1);
  });

  it('does not treat a bounded fetch as the all-results collection metadata', async () => {
    mockApiFetch
      .mockResolvedValueOnce(envelopeResponse(truncatedAllTrueBody))
      .mockResolvedValueOnce(
        envelopeResponse({
          data: [item],
          count: 1,
          truncated: false,
        })
      );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });
    expect(result.current.allResultsTruncated).toBe(true);
    expect(result.current.allResultsTotalCount).toBe(1237);

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.allResultsTruncated).toBe(true);
    expect(result.current.allResultsTotalCount).toBe(1237);
    expect(result.current.allResultsLoadedCount).toBe(1);
  });

  it('clears Org A completeness metadata on tenant change before Org B fetch', async () => {
    mockApiFetch.mockResolvedValue(envelopeResponse(truncatedAllTrueBody));

    const { result, rerender } = renderHook(
      () => ({
        consumer: useInstruments(),
        raw: useInstrumentsContext(),
      }),
      { wrapper: InstrumentsProvider }
    );

    await act(async () => {
      await result.current.consumer.fetchInstruments({ all: true });
    });

    expect(result.current.consumer.allResultsTruncated).toBe(true);
    expect(result.current.consumer.allResultsTotalCount).toBe(1237);
    expect(result.current.raw.state.allResultsTotalCount).toBe(1237);

    mockAccessScopeKey = ORG_B_SCOPE;
    rerender();

    expect(result.current.consumer.allResultsTruncated).toBe(false);
    expect(result.current.consumer.allResultsTotalCount).toBeNull();
    expect(result.current.consumer.allResultsLoadedCount).toBe(0);
    expect(result.current.raw.state.allResultsTruncated).toBe(false);
    expect(result.current.raw.state.allResultsTotalCount).toBeNull();
    expect(result.current.raw.state.allResultsLoadedCount).toBe(0);
    expect(result.current.raw.state.instruments).toEqual([]);
  });

  it('clears completeness metadata when a fatal fetch clears rows', async () => {
    mockApiFetch
      .mockResolvedValueOnce(envelopeResponse(truncatedAllTrueBody))
      .mockResolvedValueOnce(
        envelopeResponse({ error: 'Failed to fetch instruments' }, 500)
      );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });
    expect(result.current.allResultsTotalCount).toBe(1237);

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });

    expect(result.current.instruments).toEqual([]);
    expect(result.current.allResultsTruncated).toBe(false);
    expect(result.current.allResultsTotalCount).toBeNull();
    expect(result.current.allResultsLoadedCount).toBe(0);
  });

  it('invalidates authoritative total on create and delete, not update', async () => {
    const created = {
      ...item,
      id: 'item-2',
      serial_number: 'VI0001000',
    };

    mockApiFetch
      .mockResolvedValueOnce(envelopeResponse(truncatedAllTrueBody))
      .mockResolvedValueOnce(envelopeResponse({ data: created }, 201))
      .mockResolvedValueOnce(envelopeResponse(truncatedAllTrueBody))
      .mockResolvedValueOnce(
        envelopeResponse({ data: { ...created, maker: 'Updated' } })
      )
      .mockResolvedValueOnce(
        envelopeResponse({ success: true, id: created.id })
      );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });
    expect(result.current.allResultsTotalCount).toBe(1237);

    await act(async () => {
      await result.current.createInstrument({
        maker: created.maker,
        type: created.type,
        subtype: created.subtype,
        serial_number: created.serial_number,
        year: created.year,
        ownership: created.ownership,
        size: created.size,
        weight: created.weight,
        note: created.note,
        price: created.price,
        certificate: created.certificate,
        status: created.status,
      });
    });
    expect(result.current.allResultsTotalCount).toBeNull();
    expect(result.current.allResultsTruncated).toBe(true);
    expect(result.current.allResultsLoadedCount).toBe(1);

    await act(async () => {
      await result.current.fetchInstruments({ all: true });
    });
    expect(result.current.allResultsTotalCount).toBe(1237);

    await act(async () => {
      await result.current.updateInstrument(created.id, { maker: 'Updated' });
    });
    expect(result.current.allResultsTotalCount).toBe(1237);

    await act(async () => {
      await result.current.deleteInstrument(created.id);
    });
    expect(result.current.allResultsTotalCount).toBeNull();
  });
});
