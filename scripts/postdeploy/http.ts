import type { FetchLike } from './types';

export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  timeoutMs: number
): Promise<Awaited<ReturnType<FetchLike>>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      controller.signal.aborted
    ) {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${pathname}`;
}
