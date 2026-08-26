import { NextRequest } from 'next/server';

const mockApplyScopedRateLimit = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/app/api/_utils/rateLimit', () => ({
  applyScopedRateLimit: (...args: unknown[]) =>
    mockApplyScopedRateLimit(...args),
  authRateLimit: { policy: 'auth' },
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: {
    connectionsCreate: 'connections:create',
  },
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientConnectionsSchemaReadiness: jest
    .fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (req: NextRequest, auth: unknown) => unknown) =>
      (request: NextRequest) =>
        handler(request, {
          user: { id: 'user-1' },
          orgId: 'org-1',
          role: 'admin',
          userSupabase: {
            from: (...args: unknown[]) => mockFrom(...args),
            rpc: (...args: unknown[]) => mockRpc(...args),
          },
        }),
  };
});

import { POST } from '../route';

describe('POST /api/connections rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyScopedRateLimit.mockResolvedValue({ limited: false });
  });

  it('uses a scoped auth limiter with a stable route key', async () => {
    mockApplyScopedRateLimit.mockResolvedValueOnce({ limited: true });

    const request = new NextRequest('http://localhost/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        relationship_type: 'Owned',
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toBe('Too many requests');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockApplyScopedRateLimit).toHaveBeenCalledWith(
      { policy: 'auth' },
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        method: 'POST',
        routeKey: 'connections:create',
      })
    );
  });
});
