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

describe('withAuthRoute', () => {
  const mockHandler = jest.fn(async (req: NextRequest, user: any) => {
    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 200 }
    );
  });

  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);
  });

  describe('test environment bypass', () => {
    it('should bypass auth in test environment', async () => {
      setNodeEnv('test');

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test');

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
    });
  });

  describe('production environment', () => {
    beforeEach(() => {
      setNodeEnv('production');
    });

    it('should not bypass auth even with E2E_BYPASS_AUTH in production', async () => {
      process.env.E2E_BYPASS_AUTH = 'true';

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test');

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should not bypass auth even with bypass header in production', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-e2e-bypass': '1' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should require valid auth token in production', async () => {
      const mockUser = { id: 'real-user-id', email: 'user@example.com' };
      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('real-user-id');
      expect(mockHandler).toHaveBeenCalledWith(request, mockUser);
      expect(mockAuth.getUser).toHaveBeenCalled();
    });
  });

  describe('development environment', () => {
    beforeEach(() => {
      setNodeEnv('development');
    });

    it('should bypass auth with E2E_BYPASS_AUTH env var', async () => {
      process.env.E2E_BYPASS_AUTH = 'true';

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test');

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('test-user');
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('should bypass auth with x-e2e-bypass header', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-e2e-bypass': '1' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('test-user');
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('should not bypass auth without bypass header or env var', async () => {
      delete process.env.E2E_BYPASS_AUTH;

      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled(); // Benign error
    });
  });

  describe('getUserFromRequest', () => {
    beforeEach(() => {
      setNodeEnv('development');
      delete process.env.E2E_BYPASS_AUTH;
    });

    it('should return 401 when authorization header is missing', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test');

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled(); // Benign error
    });

    it('should return 401 when bearer token is empty', async () => {
      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer ' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled(); // Benign error
    });

    it('should return 401 when token is invalid', async () => {
      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockReturnValue(mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled(); // Benign error
    });

    it('should handle missing Supabase env vars', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_ANON_KEY;
      const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalPublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      // Env var missing is a non-benign error
      expect(mockCaptureException).toHaveBeenCalled();

      // Restore env vars
      if (originalUrl) process.env.SUPABASE_URL = originalUrl;
      if (originalKey) process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl)
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      if (originalPublicKey)
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalPublicKey;
    });

    it('should handle getUser throwing an error', async () => {
      const mockAuth = {
        getUser: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
      // Network errors should be captured
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should successfully authenticate valid user', async () => {
      const mockUser = { id: 'user-123', email: 'user@example.com' };
      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };

      // Mock createClient to return our mock client
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.userId).toBe('user-123');
      expect(mockHandler).toHaveBeenCalledWith(request, mockUser);
      // Verify Supabase client was created
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getUser).toHaveBeenCalled();
    });

    it('should handle Bearer token with different casing', async () => {
      const mockUser = { id: 'user-123' };
      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'bearer valid-token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockAuth.getUser).toHaveBeenCalled();
    });
  });

  describe('error handling and monitoring', () => {
    beforeEach(() => {
      setNodeEnv('development');
      delete process.env.E2E_BYPASS_AUTH;
    });

    // Note: Testing non-benign error capture is complex because getUserFromRequest
    // catches errors internally. The important thing is that 401 is returned correctly.
    it('should return 401 when getUser throws an error', async () => {
      const mockAuth = {
        getUser: jest.fn().mockRejectedValue(new Error('Network timeout')),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockImplementation(() => mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer token' },
      });

      const response = await wrappedHandler(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should not capture exception for benign auth errors', async () => {
      const mockAuth = {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        }),
      };
      const mockSupabaseClient = {
        auth: mockAuth,
      };
      mockCreateClient.mockReturnValue(mockSupabaseClient as any);

      const wrappedHandler = withAuthRoute(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
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
