import { fetchWithTimeout, joinUrl } from './http';
import type { FetchLike, SyntheticLogger } from './types';

export const DEFAULT_WAIT_TOTAL_MS = 120_000;
export const DEFAULT_WAIT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_WAIT_INTERVAL_MS = 2_000;

export type WaitForReadyOptions = {
  baseUrl: string;
  fetchImpl: FetchLike;
  totalMs?: number;
  requestTimeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: SyntheticLogger;
  now?: () => number;
};

export type WaitForReadyResult = {
  ready: boolean;
  attempts: number;
  lastStatus: number | null;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 503 || status === 502 || status === 504 || status === 429;
}

export async function waitForReady(
  options: WaitForReadyOptions
): Promise<WaitForReadyResult> {
  const totalMs = options.totalMs ?? DEFAULT_WAIT_TOTAL_MS;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_WAIT_REQUEST_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + totalMs;
  const url = joinUrl(options.baseUrl, '/api/ready');

  let attempts = 0;
  let lastStatus: number | null = null;

  while (now() < deadline) {
    attempts += 1;
    try {
      const response = await fetchWithTimeout(
        options.fetchImpl,
        url,
        { method: 'GET' },
        requestTimeoutMs
      );
      lastStatus = response.status;

      if (response.status === 200) {
        const body = (await response.json()) as { status?: unknown };
        if (body.status === 'ready') {
          options.logger?.info(
            `readiness wait succeeded after ${attempts} attempt(s)`
          );
          return { ready: true, attempts, lastStatus };
        }
        options.logger?.info(
          `attempt ${attempts}: HTTP 200 without ready status`
        );
        return { ready: false, attempts, lastStatus };
      }

      if (!isRetryableStatus(response.status)) {
        options.logger?.info(
          `attempt ${attempts}: HTTP ${response.status} is not retryable`
        );
        return { ready: false, attempts, lastStatus };
      }

      options.logger?.info(
        `attempt ${attempts}: HTTP ${response.status} (retrying)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        message === 'Request timeout' ||
        /fetch failed|econnrefused|enotfound|network/i.test(message);
      options.logger?.info(
        `attempt ${attempts}: ${retryable ? 'network/timeout (retrying)' : 'error'}`
      );
      if (!retryable) {
        return { ready: false, attempts, lastStatus };
      }
    }

    if (now() + intervalMs >= deadline) {
      break;
    }
    await sleep(intervalMs);
  }

  options.logger?.error(
    `readiness wait timed out after ${attempts} attempt(s)`
  );
  return { ready: false, attempts, lastStatus };
}
