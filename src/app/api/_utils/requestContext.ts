import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export type AuthContext = {
  userId: string;
  orgId: string | null;
  role?: string | null;
};

export function requireOrgContext(auth: AuthContext): string {
  if (!auth.orgId) {
    throw new Error('Organization context required');
  }
  return auth.orgId;
}

export function forbiddenOrgContextResponse() {
  return NextResponse.json(
    { error: 'Organization context required' },
    { status: 403 }
  );
}

export const REQUEST_ID_HEADER = 'x-request-id';

type RequestLike = Pick<NextRequest, 'headers'> | { headers?: Headers | null };

export function generateRequestId(): string {
  return randomUUID();
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
  if (response.headers && typeof response.headers.set === 'function') {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const headers = new Headers();
  headers.set(REQUEST_ID_HEADER, requestId);

  Object.defineProperty(response, 'headers', {
    value: headers,
    configurable: true,
  });

  return response;
}
