import { act, renderHook } from '@/test-utils/render';
import { InstrumentsProvider, useInstruments } from '../InstrumentsContext';
import { apiFetch } from '@/utils/apiFetch';
import { ApiResponseError } from '@/utils/handleApiResponse';
import type { Instrument } from '@/types';
import {
  INSTRUMENT_CONFLICT_CODE,
  INSTRUMENT_CONFLICT_MESSAGE,
} from '@/app/dashboard/utils/instrumentConflict';

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
    accessScopeKey: 'tenant-test',
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

const T0 = '2024-01-01T00:00:00.000Z';
const T1 = '2024-01-01T00:00:01.000Z';

const itemT0: Instrument = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  status: 'Available',
  maker: 'M0',
  type: 'Violin',
  subtype: null,
  year: 2020,
  certificate: false,
  size: null,
  weight: null,
  price: 1000,
  ownership: 'Shelf A',
  note: 'Old',
  serial_number: 'VI0000001',
  created_at: '2023-12-01T00:00:00.000Z',
  updated_at: T0,
};

const itemT1: Instrument = {
  ...itemT0,
  ownership: 'Shelf B',
  updated_at: T1,
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('InstrumentsContext updateInstrument conflict recovery', () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TEST-1: current-version update succeeds and updates collection', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ data: itemT1 }, 200));

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let updated: Instrument | undefined;
    await act(async () => {
      updated = await result.current.updateInstrument(itemT0.id, {
        note: 'A note',
        updated_at: T1,
      });
    });

    expect(updated?.updated_at).toBe(T1);
    expect(updated?.ownership).toBe('Shelf B');
    expect(
      mockApiFetch.mock.calls.filter(
        call => (call[1] as { method?: string } | undefined)?.method === 'PATCH'
      )
    ).toHaveLength(1);
  });

  it('TEST-5/13: 409 refreshes latest collection state and does not auto-retry', async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if ((init as { method?: string } | undefined)?.method === 'PATCH') {
        return jsonResponse(
          {
            error: INSTRUMENT_CONFLICT_MESSAGE,
            error_code: INSTRUMENT_CONFLICT_CODE,
            success: false,
          },
          409
        );
      }

      expect(String(url)).toContain('/api/instruments?');
      expect(String(url)).toContain('all=true');
      return jsonResponse({ data: [itemT1] }, 200);
    });

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await expect(
        result.current.updateInstrument(itemT0.id, {
          note: 'A note',
          ownership: 'Shelf A',
          updated_at: T0,
        })
      ).rejects.toBeInstanceOf(ApiResponseError);
    });

    const patchCalls = mockApiFetch.mock.calls.filter(
      call => (call[1] as { method?: string } | undefined)?.method === 'PATCH'
    );
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(String(patchCalls[0][1]?.body))).toEqual(
      expect.objectContaining({
        id: itemT0.id,
        note: 'A note',
        ownership: 'Shelf A',
        updated_at: T0,
      })
    );
    expect(result.current.instruments[0]?.updated_at).toBe(T1);
    expect(result.current.instruments[0]?.ownership).toBe('Shelf B');
  });

  it('TEST-18: non-409 errors do not refresh collection as conflict recovery', async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ error: 'Network error' }, 500)
    );

    const { result } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    await act(async () => {
      await expect(
        result.current.updateInstrument(itemT0.id, {
          note: 'A note',
          updated_at: T0,
        })
      ).rejects.toBeDefined();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.instruments).toEqual([]);
  });
});
