/** @jest-environment node */

import { waitForReady } from '../wait-for-ready';
import type { FetchLike } from '../types';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('waitForReady', () => {
  it('succeeds on explicit HTTP 200 ready without waiting the full budget', async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(200, { status: 'ready' })
    );
    const sleep = jest.fn();

    const result = await waitForReady({
      baseUrl: 'https://staging.example.test',
      fetchImpl,
      totalMs: 10_000,
      intervalMs: 1_000,
      sleep,
    });

    expect(result).toEqual({ ready: true, attempts: 1, lastStatus: 200 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 503 until ready', async () => {
    const fetchImpl: FetchLike = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { status: 'not_ready' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'ready' }));

    const result = await waitForReady({
      baseUrl: 'https://staging.example.test',
      fetchImpl,
      totalMs: 10_000,
      intervalMs: 1,
      sleep: async () => undefined,
    });

    expect(result.ready).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('fails after the deadline while still 503', async () => {
    let now = 0;
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(503, { status: 'not_ready' })
    );

    const result = await waitForReady({
      baseUrl: 'https://staging.example.test',
      fetchImpl,
      totalMs: 30,
      intervalMs: 10,
      now: () => now,
      sleep: async ms => {
        now += ms;
      },
    });

    expect(result.ready).toBe(false);
    expect(result.attempts).toBeGreaterThan(0);
    expect(result.lastStatus).toBe(503);
  });

  it('does not retry a non-temporary HTTP status', async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(404, { error: 'missing' })
    );

    const result = await waitForReady({
      baseUrl: 'https://staging.example.test',
      fetchImpl,
      totalMs: 10_000,
      sleep: async () => undefined,
    });

    expect(result.ready).toBe(false);
    expect(result.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
