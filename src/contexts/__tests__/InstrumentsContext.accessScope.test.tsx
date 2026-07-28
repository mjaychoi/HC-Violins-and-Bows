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

const ADMIN_SCOPE = 'user-1:org-1:2024-01-01T00:00:00Z:admin:1';
const MEMBER_SCOPE = 'user-1:org-1:2024-01-01T00:00:00Z:member:0';
const OTHER_ORG_SCOPE = 'user-1:org-2:2024-01-01T00:00:00Z:admin:1';
const OTHER_USER_SCOPE = 'user-2:org-1:2024-01-01T00:00:00Z:admin:1';

const baseInstrument: Instrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: null,
  serial_number: 'STR001',
  year: 1720,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: 50000,
  certificate: false,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
};

function adminInstrument(): Instrument {
  return {
    ...baseInstrument,
    cost_price: 25000,
    consignment_price: 30000,
  };
}

function memberInstrument(): Instrument {
  return { ...baseInstrument };
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  } as unknown as Response;
}

function createDeferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(res => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('InstrumentsContext access scope security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessScopeKey = ADMIN_SCOPE;
  });

  it('admin fetch includes cost_price and consignment_price', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBe(25000);
    expect(result.current.instruments[0]?.consignment_price).toBe(30000);
  });

  it('replaces state when member payload removes sensitive fields with same id and updated_at', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse([adminInstrument()]))
      .mockResolvedValueOnce(jsonResponse([memberInstrument()]));

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBe(25000);

    mockAccessScopeKey = MEMBER_SCOPE;
    rerender();

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments).toHaveLength(1);
    expect(result.current.instruments[0]?.cost_price).toBeUndefined();
    expect(result.current.instruments[0]?.consignment_price).toBeUndefined();
  });

  it('never exposes privileged instruments to consumers when scope changes', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result, rerender } = renderHook(
      () => ({
        consumer: useInstruments(),
        raw: useInstrumentsContext(),
      }),
      { wrapper: InstrumentsProvider }
    );

    await act(async () => {
      await result.current.consumer.fetchInstruments();
    });

    expect(result.current.consumer.instruments[0]?.cost_price).toBe(25000);
    expect(result.current.raw.state.loadedAccessScopeKey).toBe(ADMIN_SCOPE);

    mockAccessScopeKey = MEMBER_SCOPE;
    rerender();

    expect(result.current.consumer.instruments).toEqual([]);
    expect(result.current.consumer.instruments[0]?.cost_price).toBeUndefined();
  });

  it('shows financial fields for member only after a fresh admin fetch', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse([memberInstrument()]))
      .mockResolvedValueOnce(jsonResponse([adminInstrument()]));

    mockAccessScopeKey = MEMBER_SCOPE;

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBeUndefined();

    mockAccessScopeKey = ADMIN_SCOPE;
    rerender();

    expect(result.current.instruments).toEqual([]);

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBe(25000);
    expect(result.current.instruments[0]?.consignment_price).toBe(30000);
  });

  it('returns empty instruments after logout', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments).toHaveLength(1);

    mockAccessScopeKey = null;
    rerender();

    expect(result.current.instruments).toEqual([]);
  });

  it('never renders instruments from a previous organization', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    mockAccessScopeKey = OTHER_ORG_SCOPE;
    rerender();

    expect(result.current.instruments).toEqual([]);
  });

  it('never renders instruments from a previous user', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    mockAccessScopeKey = OTHER_USER_SCOPE;
    rerender();

    expect(result.current.instruments).toEqual([]);
  });

  it('ignores stale fetch responses after access scope changes', async () => {
    const deferred = createDeferredResponse();
    mockApiFetch.mockReturnValueOnce(deferred.promise);

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let staleFetch: Promise<void> | undefined;
    await act(async () => {
      staleFetch = result.current.fetchInstruments();
    });

    mockAccessScopeKey = MEMBER_SCOPE;
    rerender();

    mockApiFetch.mockResolvedValueOnce(jsonResponse([memberInstrument()]));

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBeUndefined();

    await act(async () => {
      deferred.resolve(jsonResponse([adminInstrument()]));
      await staleFetch;
    });

    expect(result.current.instruments[0]?.cost_price).toBeUndefined();
  });

  it('keeps valid data after access token refresh when permissions are unchanged', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([adminInstrument()]));

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.fetchInstruments();
    });

    expect(result.current.instruments[0]?.cost_price).toBe(25000);

    rerender();

    expect(result.current.instruments[0]?.cost_price).toBe(25000);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
