import { NextRequest } from 'next/server';

const mockApplyScopedRateLimit = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/app/api/_utils/rateLimit', () => ({
  applyScopedRateLimit: (...args: unknown[]) =>
    mockApplyScopedRateLimit(...args),
  mutationRateLimit: {},
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn(),
}));

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
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
            rpc: mockRpc,
            from: jest.fn(),
          },
        }),
  };
});

jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertInvoiceSchemaReadiness: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';

describe('/api/invoices POST rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyScopedRateLimit.mockResolvedValue({ limited: false });
  });

  it('returns 429 before invoice RPC when mutation rate limit is exceeded', async () => {
    mockApplyScopedRateLimit.mockResolvedValueOnce({ limited: true });

    const request = new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem-1',
      },
      body: JSON.stringify({
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'draft',
        items: [],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.message ?? json.error).toBe('Too many requests');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses org/user/method/route scoped keys', async () => {
    const request = new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem-1',
      },
      body: JSON.stringify({
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'draft',
        items: [],
      }),
    });

    await POST(request);

    expect(mockApplyScopedRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        method: 'POST',
        routeKey: 'invoices',
      })
    );
  });
});
