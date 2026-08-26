import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getCookieBackedAuth } from '@/lib/supabase-server';

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/lib/supabase-server', () => ({
  getCookieBackedAuth: jest.fn(),
}));

jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));

const mockGetCookieBackedAuth = getCookieBackedAuth as jest.MockedFunction<
  typeof getCookieBackedAuth
>;

describe('/api/notification-settings auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCookieBackedAuth.mockResolvedValue(null);
  });

  it('returns 401 for GET without a session', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/notification-settings')
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error_code).toBe('UNAUTHORIZED');
    expect(json.message).toBe('Valid Supabase session is required');
    expect(mockGetCookieBackedAuth).toHaveBeenCalled();
  });

  it('returns 401 for POST without a session', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/notification-settings', {
        method: 'POST',
        body: JSON.stringify({ email_notifications: true }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error_code).toBe('UNAUTHORIZED');
    expect(json.message).toBe('Valid Supabase session is required');
    expect(mockGetCookieBackedAuth).toHaveBeenCalled();
  });
});
