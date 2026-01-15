import { NextRequest, NextResponse } from 'next/server';
import { withAuthRoute } from '../withAuthRoute';
import { createClient } from '@supabase/supabase-js';
import { captureException } from '@/utils/monitoring';

jest.mock('@supabase/supabase-js');
jest.mock('@/utils/monitoring');

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;

const setNodeEnv = (value?: string) => {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    return;
  }

  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  });
};

const makeReq = (
  url = 'http://localhost/api/test',
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(url, init);

describe('withAuthRoute', () => {
  const mockHandler = jest.fn(async (_req: NextRequest, user: any) => {
    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 200 }
    );
  });

  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();

    // Restore env safely
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);

    // Defaults used by auth util
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';

    // Avoid env leakage across tests
    delete process.env.E2E_BYPASS_AUTH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);
    delete process.env.E2E_BYPASS_AUTH;
  });

  describe('test environment bypass', () => {
    it('should bypass auth in test environment', async () => {
      setNodeEnv('test');

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq();

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('test-user');
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ id: 'test-user' })
      );

      // In NODE_ENV=test we never create supabase client
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('production environment', () => {
    beforeEach(() => {
      setNodeEnv('production');
    });

    it('should not bypass auth even with E2E_BYPASS_AUTH in production', async () => {
      process.env.E2E_BYPASS_AUTH = 'true';

      // In production, bypass is ignored and it should attempt auth => return 401.
      // Provide a deterministic supabase mock so behavior doesn't depend on undefined mocks.
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: null,
            user: null,
          },
          error: { message: 'Invalid token' },
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      // benign invalid token => should not capture
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
    });

    it('should not bypass auth even with bypass header in production', async () => {
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: null,
            user: null,
          },
          error: { message: 'Invalid token' },
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { 'x-e2e-bypass': '1', authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
    });

    it.skip('should require valid auth token in production', async () => {
      const mockUser = { id: 'real-user-id', email: 'user@example.com' };
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: { user: mockUser },
            user: mockUser,
          },
          error: null,
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('real-user-id');
      expect(mockHandler).toHaveBeenCalledWith(request, mockUser);
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('development environment', () => {
    beforeEach(() => {
      setNodeEnv('development');
    });

    it('should bypass auth with E2E_BYPASS_AUTH env var', async () => {
      process.env.E2E_BYPASS_AUTH = 'true';

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq();

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('test-user');

      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ id: 'test-user' })
      );
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should bypass auth with x-e2e-bypass header', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { 'x-e2e-bypass': '1' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('test-user');

      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it.skip('should not bypass auth without bypass header or env var', async () => {
      delete process.env.E2E_BYPASS_AUTH;

      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: null,
            user: null,
          },
          error: { message: 'Invalid token' },
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      // Benign auth failure
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
    });
  });

  describe('getUserFromRequest (via wrapper)', () => {
    beforeEach(() => {
      setNodeEnv('development');
      delete process.env.E2E_BYPASS_AUTH;
    });

    it.skip('should return 401 when authorization header is missing', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq();

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');

      expect(mockHandler).not.toHaveBeenCalled();
      // Missing token is benign
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it.skip('should return 401 when bearer token is empty', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer ' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it.skip('should return 401 when token is invalid', async () => {
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: null,
            user: null,
          },
          error: { message: 'Invalid token' },
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
    });

    it('should handle missing Supabase env vars (non-benign => capture)', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_ANON_KEY;
      const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalPublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      // Env var missing is non-benign
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockCreateClient).not.toHaveBeenCalled();

      // Restore env vars
      if (originalUrl) process.env.SUPABASE_URL = originalUrl;
      if (originalKey) process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl)
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      if (originalPublicKey)
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalPublicKey;
    });

    it('should handle getUser throwing an error (non-benign => capture)', async () => {
      const mockAuth = {
        getSession: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      // Network errors should be captured
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
    });

    it.skip('should successfully authenticate valid user', async () => {
      const mockUser = { id: 'user-123', email: 'user@example.com' };
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: { user: mockUser },
            user: mockUser,
          },
          error: null,
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('user-123');

      expect(mockHandler).toHaveBeenCalledWith(request, mockUser);
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it.skip('should handle Bearer token with different casing', async () => {
      const mockUser = { id: 'user-123' };
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: { user: mockUser },
            user: mockUser,
          },
          error: null,
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('user-123');

      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getSession).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('error handling and monitoring', () => {
    beforeEach(() => {
      setNodeEnv('development');
      delete process.env.E2E_BYPASS_AUTH;
    });

    it('should return 401 when getUser throws an error', async () => {
      const mockAuth = {
        getSession: jest.fn().mockRejectedValue(new Error('Network timeout')),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();

      // network error => non-benign capture
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it.skip('should not capture exception for benign auth errors', async () => {
      const mockAuth = {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: null,
            user: null,
          },
          error: { message: 'Invalid token' },
        }),
      };
      mockCreateClient.mockReturnValue({ auth: mockAuth } as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = makeReq('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
