import { NextRequest, NextResponse } from 'next/server';
import { withAuthRoute } from '../withAuthRoute';
import {
  getCookieBackedAuth,
  type CookieBackedAuthResult,
} from '@/lib/supabase-server';
import { captureException } from '@/utils/monitoring';

jest.mock('@/lib/supabase-server', () => ({
  getCookieBackedAuth: jest.fn(),
}));
jest.mock('@/utils/monitoring');

const mockGetCookieBackedAuth = getCookieBackedAuth as jest.MockedFunction<
  typeof getCookieBackedAuth
>;
const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;

const makeReq = (
  url = 'http://localhost/api/test',
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(url, init);

function makeCookieAuthResult(
  overrides: Partial<CookieBackedAuthResult['user']> = {}
): CookieBackedAuthResult {
  return {
    accessToken: 'cookie-token',
    userSupabase: {} as CookieBackedAuthResult['userSupabase'],
    user: {
      id: 'user-123',
      email: 'user@example.com',
      app_metadata: { org_id: 'org-123', role: 'admin' },
      user_metadata: {},
      ...overrides,
    } as CookieBackedAuthResult['user'],
  };
}

describe('withAuthRoute', () => {
  const mockHandler = jest.fn(async (_req: NextRequest, auth: any) => {
    return NextResponse.json(
      {
        success: true,
        userId: auth.user.id,
        role: auth.role,
        orgId: auth.orgId,
      },
      { status: 200 }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when cookie-backed auth is missing', async () => {
    mockGetCookieBackedAuth.mockResolvedValueOnce(null);

    const wrappedHandler = withAuthRoute(mockHandler);
    const response = await wrappedHandler(makeReq());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.message).toBe('Valid Supabase session is required');
    expect(json.error_code).toBe('UNAUTHORIZED');
    expect(mockHandler).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('authenticates from the canonical cookie-backed helper', async () => {
    mockGetCookieBackedAuth.mockResolvedValueOnce(makeCookieAuthResult());

    const wrappedHandler = withAuthRoute(mockHandler);
    const request = makeReq();
    const response = await wrappedHandler(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.userId).toBe('user-123');
    expect(json.role).toBe('admin');
    expect(json.orgId).toBe('org-123');
    expect(mockHandler).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        accessToken: 'cookie-token',
        orgId: 'org-123',
        role: 'admin',
        isTestBypass: false,
      })
    );
  });

  it('trusts app_metadata over user_metadata for org and role', async () => {
    mockGetCookieBackedAuth.mockResolvedValueOnce(
      makeCookieAuthResult({
        app_metadata: { org_id: 'org-from-app-meta', role: 'member' },
        user_metadata: { org_id: 'evil-org', role: 'admin' },
      })
    );

    const wrappedHandler = withAuthRoute(mockHandler);
    const response = await wrappedHandler(makeReq());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.role).toBe('member');
    expect(json.orgId).toBe('org-from-app-meta');
  });

  it('captures unexpected auth helper errors', async () => {
    mockGetCookieBackedAuth.mockRejectedValueOnce(new Error('Network timeout'));

    const wrappedHandler = withAuthRoute(mockHandler);
    const response = await wrappedHandler(makeReq());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.message).toBe('Valid Supabase session is required');
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
