import { act, renderHook, waitFor } from '@testing-library/react';
import { useSalesHistory } from '../useSalesHistory';
import { apiFetch } from '@/utils/apiFetch';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(error => error),
  }),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useSalesHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps loading true until overlapping fetches have both settled', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();

    mockApiFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useSalesHistory());

    let firstFetch!: Promise<void>;
    let secondFetch!: Promise<void>;

    act(() => {
      firstFetch = result.current.fetchSales({ page: 1 });
      secondFetch = result.current.fetchSales({ page: 2 });
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.resolve(
        jsonResponse({
          data: [],
          pagination: { page: 2, pageSize: 10, totalCount: 0, totalPages: 1 },
        })
      );
      await secondFetch;
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      first.resolve(
        jsonResponse({
          data: [],
          pagination: { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 },
        })
      );
      await firstFetch;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
