import { NextRequest } from 'next/server';

const mockApplyScopedRateLimit = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/app/api/_utils/rateLimit', () => ({
  applyScopedRateLimit: (...args: unknown[]) =>
    mockApplyScopedRateLimit(...args),
  searchRateLimit: { policy: 'search' },
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: {
    clientsList: 'clients:list',
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
  assertClientsSchemaReadiness: jest.fn().mockResolvedValue(undefined),
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
          userSupabase: { from: (...args: unknown[]) => mockFrom(...args) },
        }),
  };
});

import { GET } from '../route';

describe('GET /api/clients list rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyScopedRateLimit.mockResolvedValue({ limited: false });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      or: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    });
  });

  it('uses a scoped search limiter with a stable route key', async () => {
    const request = new NextRequest(
      'http://localhost/api/clients?page=3&search=doe'
    );
    await GET(request);

    expect(mockApplyScopedRateLimit).toHaveBeenCalledWith(
      { policy: 'search' },
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        method: 'GET',
        routeKey: 'clients:list',
      })
    );
  });

  it('returns 429 and does not query clients when limited', async () => {
    mockApplyScopedRateLimit.mockResolvedValueOnce({ limited: true });

    const request = new NextRequest('http://localhost/api/clients');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toBe('Too many requests');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
