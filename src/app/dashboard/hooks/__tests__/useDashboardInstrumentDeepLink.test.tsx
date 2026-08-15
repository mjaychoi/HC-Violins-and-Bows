import { renderHook, act, waitFor } from '@/test-utils/render';
import { useDashboardInstrumentDeepLink } from '../useDashboardInstrumentDeepLink';
import { apiFetch } from '@/utils/apiFetch';
import { readApiResponseEnvelope } from '@/utils/handleApiResponse';
import type { Instrument } from '@/types';

const mockNav = {
  search: '',
  replace: jest.fn(),
};

const mockTenant = {
  tenantIdentityKey: 'user-a:org-a:session-a' as string | null,
  isTenantTransitioning: false,
};

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockNav.search),
  useRouter: () => ({ replace: mockNav.replace }),
  usePathname: () => '/dashboard',
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => mockTenant,
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/utils/handleApiResponse', () => ({
  readApiResponseEnvelope: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockReadEnvelope = readApiResponseEnvelope as jest.MockedFunction<
  typeof readApiResponseEnvelope
>;

const TARGET_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '123e4567-e89b-12d3-a456-426614174111';

const localInstrument: Instrument = {
  id: TARGET_ID,
  maker: 'Stradivari',
  type: 'Violin',
  subtype: '4/4',
  serial_number: 'SM703171000026',
  year: 1700,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: 1000,
  certificate: false,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const remoteInstrument: Instrument = {
  ...localInstrument,
  id: OTHER_ID,
  maker: 'Guarneri',
  serial_number: 'REMOTE-001',
};

function setInstrumentId(id: string | null) {
  mockNav.search = id ? `instrumentId=${encodeURIComponent(id)}` : '';
}

function renderDeepLink(
  overrides: Partial<Parameters<typeof useDashboardInstrumentDeepLink>[0]> = {}
) {
  return renderHook(() =>
    useDashboardInstrumentDeepLink({
      instruments: [localInstrument],
      truncated: false,
      instrumentsLoading: false,
      hasFatalError: false,
      ...overrides,
    })
  );
}

describe('useDashboardInstrumentDeepLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNav.search = '';
    mockNav.replace.mockReset();
    mockTenant.tenantIdentityKey = 'user-a:org-a:session-a';
    mockTenant.isTenantTransitioning = false;
    mockApiFetch.mockReset();
    mockReadEnvelope.mockReset();
  });

  it('D1: shows a valid local target without an exact-id request', () => {
    setInstrumentId(TARGET_ID);
    const { result } = renderDeepLink();

    expect(result.current.status).toBe('ready');
    expect(result.current.target).toEqual(localInstrument);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('D2: valid UUID missing from a complete collection is not found', async () => {
    setInstrumentId(OTHER_ID);
    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: false,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('not_found');
    });
    expect(result.current.target).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('D3: deleted target from a complete collection is not found', async () => {
    setInstrumentId(TARGET_ID);
    const remaining: Instrument = {
      ...localInstrument,
      id: '123e4567-e89b-12d3-a456-426614174222',
      maker: 'Amati',
    };
    const { result, rerender } = renderHook(
      ({ instruments }) =>
        useDashboardInstrumentDeepLink({
          instruments,
          truncated: false,
          instrumentsLoading: false,
          hasFatalError: false,
        }),
      { initialProps: { instruments: [localInstrument, remaining] } }
    );

    expect(result.current.status).toBe('ready');

    rerender({ instruments: [remaining] });

    await waitFor(() => {
      expect(result.current.status).toBe('not_found');
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('D4: missing exact lookup is indistinguishable not-found (cross-org)', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValue({ status: 404, ok: false } as Response);

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('not_found');
    });
    expect(result.current.target).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/instruments?id=${OTHER_ID}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('D5: invalid UUID does not issue a DB/API lookup', () => {
    setInstrumentId('garbage');
    const { result } = renderDeepLink({ truncated: true });

    expect(result.current.status).toBe('invalid');
    expect(result.current.target).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('D6: truncated bulk list resolves a target outside the local cache', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValue({ status: 200, ok: true } as Response);
    mockReadEnvelope.mockResolvedValue({ data: [remoteInstrument] });

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.target).toEqual(remoteInstrument);
  });

  it('D7: truncated bulk list + exact lookup 404 is not found', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValue({ status: 404, ok: false } as Response);

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('not_found');
    });
  });

  it('D8: exact lookup 500 is a retryable error, not not-found', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValue({ status: 500, ok: false } as Response);

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.instrumentId).toBe(OTHER_ID);
  });

  it('D8b: network failure is a retryable error, not not-found', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
  });

  it('D9: retry after error shows the target', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValueOnce({ status: 500, ok: false } as Response);

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    mockApiFetch.mockResolvedValue({ status: 200, ok: true } as Response);
    mockReadEnvelope.mockResolvedValue({ data: [remoteInstrument] });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.target).toEqual(remoteInstrument);
  });

  it('D10: discards a Tenant A response after switching to Tenant B', async () => {
    setInstrumentId(OTHER_ID);
    let resolveA: (value: Response) => void = () => undefined;
    const promiseA = new Promise<Response>(resolve => {
      resolveA = resolve;
    });

    mockApiFetch
      .mockReturnValueOnce(promiseA)
      .mockResolvedValue({ status: 404, ok: false } as Response);

    const { result, rerender } = renderHook(
      ({ tenantKey, instruments }) => {
        mockTenant.tenantIdentityKey = tenantKey;
        return useDashboardInstrumentDeepLink({
          instruments,
          truncated: true,
          instrumentsLoading: false,
          hasFatalError: false,
        });
      },
      {
        initialProps: {
          tenantKey: 'user-a:org-a:session-a',
          instruments: [localInstrument],
        },
      }
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    rerender({
      tenantKey: 'user-b:org-b:session-b',
      instruments: [],
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.status).toBe('not_found');
    });

    mockReadEnvelope.mockResolvedValue({ data: [remoteInstrument] });
    resolveA({ status: 200, ok: true } as Response);

    await act(async () => {
      await promiseA;
    });

    expect(result.current.status).toBe('not_found');
    expect(result.current.target).toBeNull();
  });

  it('D11: instrumentId A → B race keeps B', async () => {
    let resolveA: (value: Response) => void = () => undefined;
    const promiseA = new Promise<Response>(resolve => {
      resolveA = resolve;
    });

    mockApiFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(TARGET_ID)) {
        return promiseA;
      }
      return { status: 200, ok: true } as Response;
    });
    mockReadEnvelope.mockImplementation(async () => ({
      data: [remoteInstrument],
    }));

    const { result, rerender } = renderHook(
      ({ id }) => {
        setInstrumentId(id);
        return useDashboardInstrumentDeepLink({
          instruments: [],
          truncated: true,
          instrumentsLoading: false,
          hasFatalError: false,
        });
      },
      { initialProps: { id: TARGET_ID } }
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    rerender({ id: OTHER_ID });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.target).toEqual(remoteInstrument);

    mockReadEnvelope.mockResolvedValue({ data: [localInstrument] });
    resolveA({ status: 200, ok: true } as Response);

    await act(async () => {
      await promiseA;
    });

    expect(result.current.target).toEqual(remoteInstrument);
    expect(result.current.instrumentId).toBe(OTHER_ID);
  });

  it('D13: clearing the deep link removes only instrumentId', () => {
    mockNav.search = `instrumentId=${TARGET_ID}&search=Strad`;
    const { result } = renderDeepLink();

    act(() => {
      result.current.clearDeepLink();
    });

    expect(mockNav.replace).toHaveBeenCalledWith('/dashboard?search=Strad', {
      scroll: false,
    });
  });

  it('does not flash a resolved empty collection while instruments are still loading', () => {
    setInstrumentId(OTHER_ID);
    const { result } = renderDeepLink({
      instruments: [],
      truncated: false,
      instrumentsLoading: true,
    });

    expect(result.current.status).toBe('loading');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not treat an exact lookup as proof the bulk cache is complete', async () => {
    setInstrumentId(OTHER_ID);
    mockApiFetch.mockResolvedValue({ status: 200, ok: true } as Response);
    mockReadEnvelope.mockResolvedValue({ data: [remoteInstrument] });

    const { result } = renderDeepLink({
      instruments: [localInstrument],
      truncated: true,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.target?.id).toBe(OTHER_ID);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
