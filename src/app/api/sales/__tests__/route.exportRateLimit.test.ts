import { NextRequest } from 'next/server';

const mockApplyScopedRateLimit = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/app/api/_utils/rateLimit', () => ({
  applyScopedRateLimit: (...args: unknown[]) =>
    mockApplyScopedRateLimit(...args),
  exportRateLimit: { policy: 'export' },
  mutationRateLimit: {},
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: {
    salesExport: 'sales:export',
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
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown) => error),
  },
}));

const mockAuthContext = {
  user: { id: 'user-1' },
  orgId: 'org-1',
  role: 'admin' as const,
  userSupabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
};

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (req: NextRequest, auth: unknown) => unknown) =>
      (request: NextRequest) =>
        handler(request, mockAuthContext),
  };
});

import { GET } from '../route';

describe('GET /api/sales export rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext.role = 'admin';
    mockApplyScopedRateLimit.mockResolvedValue({ limited: false });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('uses the distributed export limiter with a stable scoped key', async () => {
    const request = new NextRequest(
      'http://localhost/api/sales?export=true&page=2&search=strad'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockApplyScopedRateLimit).toHaveBeenCalledWith(
      { policy: 'export' },
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        method: 'GET',
        routeKey: 'sales:export',
      })
    );
  });

  it('returns 429 and does not query the database when export is limited', async () => {
    mockApplyScopedRateLimit.mockResolvedValueOnce({ limited: true });

    const request = new NextRequest(
      'http://localhost/api/sales?export=true&pageSize=5000'
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toBe('Too many requests');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not consume the sales-export bucket for ordinary paginated reads', async () => {
    const request = new NextRequest('http://localhost/api/sales?page=1');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockApplyScopedRateLimit).not.toHaveBeenCalled();
  });

  it('does not consume the sales-export bucket for all=true lists', async () => {
    const request = new NextRequest('http://localhost/api/sales?all=true');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockApplyScopedRateLimit).not.toHaveBeenCalled();
  });
});
