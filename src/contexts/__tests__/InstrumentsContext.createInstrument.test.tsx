import { act, renderHook } from '@/test-utils/render';
import { InstrumentsProvider, useInstruments } from '../InstrumentsContext';
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

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'tenant-test',
    isTenantTransitioning: false,
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

const minimalCreateBody: Omit<Instrument, 'id' | 'created_at'> = {
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
};

describe('InstrumentsContext createInstrument', () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when POST is not ok', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.createInstrument(minimalCreateBody);
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeDefined();
  });

  it('throws when response is ok but data is missing', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
    } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.createInstrument(minimalCreateBody);
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('empty response');
  });

  it('resolves with instrument and updates state when POST succeeds', async () => {
    const created = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...minimalCreateBody,
      created_at: '2024-01-01T00:00:00Z',
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: created }),
    } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let createdResult: Instrument | undefined;
    await act(async () => {
      createdResult = await result.current.createInstrument(minimalCreateBody);
    });

    expect(createdResult).toEqual(expect.objectContaining({ id: created.id }));
    expect(result.current.instruments.some(i => i.id === created.id)).toBe(
      true
    );
  });
});

describe('InstrumentsContext updateInstrument', () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when PATCH is not ok', async () => {
    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    } as unknown as Response);

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.updateInstrument('id-1', { maker: 'X' });
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeDefined();
  });

  it('throws when response is ok but data is missing', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.updateInstrument('id-1', { maker: 'X' });
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('empty response');
  });

  it('returns updated instrument and updates list state', async () => {
    const created = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...minimalCreateBody,
      created_at: '2024-01-01T00:00:00Z',
    };
    const updated = { ...created, maker: 'Guarneri' };

    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updated }),
      } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.createInstrument(minimalCreateBody);
    });

    let out: Instrument | undefined;
    await act(async () => {
      out = await result.current.updateInstrument(created.id, {
        maker: 'Guarneri',
      });
    });

    expect(out).toEqual(
      expect.objectContaining({ id: created.id, maker: 'Guarneri' })
    );
    expect(result.current.instruments[0]?.maker).toBe('Guarneri');
  });
});

describe('InstrumentsContext deleteInstrument', () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when DELETE is not ok', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.deleteInstrument('id-1');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeDefined();
  });

  it('removes local row only after DELETE succeeds', async () => {
    const created = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...minimalCreateBody,
      created_at: '2024-01-01T00:00:00Z',
    };

    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, id: created.id }),
      } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.createInstrument(minimalCreateBody);
    });
    expect(result.current.instruments).toHaveLength(1);

    await act(async () => {
      await result.current.deleteInstrument(created.id);
    });

    expect(result.current.instruments).toHaveLength(0);
  });

  it('does not remove local row when DELETE fails', async () => {
    const created = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...minimalCreateBody,
      created_at: '2024-01-01T00:00:00Z',
    };

    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'fail' }),
      } as unknown as Response);

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await result.current.createInstrument(minimalCreateBody);
    });
    expect(result.current.instruments).toHaveLength(1);

    await act(async () => {
      try {
        await result.current.deleteInstrument(created.id);
      } catch {
        /* expected */
      }
    });

    expect(result.current.instruments).toHaveLength(1);
  });
});
