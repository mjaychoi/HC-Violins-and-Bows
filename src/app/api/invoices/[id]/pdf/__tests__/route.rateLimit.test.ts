/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockApplyScopedRateLimit = jest.fn();
const mockFrom = jest.fn();
let mockAuthContext: {
  user: { id: string };
  orgId: string | null;
  role: 'admin' | 'member';
  userSupabase: { from: jest.Mock };
};

jest.mock('next/server', () => {
  const actual = jest.requireActual(
    'next/server'
  ) as typeof import('next/server');

  class TestNextResponse extends Response {
    static json = actual.NextResponse.json.bind(actual.NextResponse);
    static redirect = actual.NextResponse.redirect.bind(actual.NextResponse);
    static rewrite = actual.NextResponse.rewrite.bind(actual.NextResponse);
    static next = actual.NextResponse.next.bind(actual.NextResponse);
  }

  return {
    ...actual,
    NextResponse: TestNextResponse,
  };
});

jest.mock('@react-pdf/renderer', () => ({
  __esModule: true,
  renderToBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
}));

jest.mock('@/components/invoices/InvoiceDocument', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/utils/logger', () => ({
  logApiRequest: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
}));
jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));
jest.mock('@/app/api/_utils/rateLimit', () => ({
  applyScopedRateLimit: (...args: unknown[]) =>
    mockApplyScopedRateLimit(...args),
  exportRateLimit: { policy: 'export' },
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: {
    invoicesPdf: 'invoices:pdf',
  },
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));
jest.mock('@/app/api/invoices/imageUrls', () => ({
  attachSignedUrlsToInvoiceItems: async (
    _supabase: unknown,
    items: unknown[]
  ) => items,
}));
jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (request: unknown, auth: unknown) => unknown) =>
      async (request: unknown) =>
        handler(request, mockAuthContext),
  };
});

const INVOICE_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/invoices/:id/pdf rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyScopedRateLimit.mockResolvedValue({ limited: false });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockAuthContext = {
      user: { id: 'user-1' },
      orgId: 'org-1',
      role: 'admin',
      userSupabase: { from: mockFrom },
    };
  });

  it('uses a stable scoped export key and ignores the invoice id namespace', async () => {
    const { GET } = await import('../route');
    await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );

    expect(mockApplyScopedRateLimit).toHaveBeenCalledWith(
      { policy: 'export' },
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        method: 'GET',
        routeKey: 'invoices:pdf',
      })
    );
    const scope = mockApplyScopedRateLimit.mock.calls[0][1] as {
      routeKey: string;
    };
    expect(scope.routeKey).not.toContain(INVOICE_ID);
  });

  it('returns 429 and does not query invoices when limited', async () => {
    mockApplyScopedRateLimit.mockResolvedValueOnce({
      limited: true,
      retryAfterSeconds: 12,
    });
    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.message ?? json.error).toBe('Too many requests');
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('enforces admin authorization before rate limiting', async () => {
    mockAuthContext.role = 'member';
    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error_code).toBe('ADMIN_ROLE_REQUIRED');
    expect(mockApplyScopedRateLimit).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
