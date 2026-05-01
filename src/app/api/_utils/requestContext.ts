import type { NextRequest, NextResponse } from 'next/server';

export const REQUEST_ID_HEADER = 'x-request-id';

type RequestLike = Pick<NextRequest, 'headers'> | { headers?: Headers | null };

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function getOrCreateRequestId(request: RequestLike): string {
  try {
    const requestId = request.headers?.get(REQUEST_ID_HEADER)?.trim();
    return requestId || generateRequestId();
  } catch {
    return generateRequestId();
  }
}

export function withRequestIdHeader<T extends Response | NextResponse>(
  response: T,
  requestId: string
): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
