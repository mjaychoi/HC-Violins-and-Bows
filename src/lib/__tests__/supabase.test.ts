import { getSupabase } from '../supabase';
import { getSupabaseClient } from '../supabase-client';

jest.mock('../supabase-client', () => ({
  getSupabaseClient: jest.fn(),
}));

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<
  typeof getSupabaseClient
>;

describe('supabase (legacy wrapper)', () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    // Set default env vars for most tests
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      writable: true,
      configurable: true,
    });

    // 기본적으로 Promise-like Supabase 클라이언트를 반환하도록 mock
    const mockClient = { from: jest.fn() } as any;
    mockGetSupabaseClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
    });
  });

  it('should create supabase client with valid env vars', () => {
    const { supabase: testSupabase } = require('../supabase');

    expect(testSupabase).toBeDefined();
  });

  it('should create placeholder client when env vars are missing in production build', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true,
    });
    // Simulate build time (no window)
    const originalWindow = global.window;
    delete (global as { window?: unknown }).window;

    // Should not throw during build
    expect(() => {
      require('../supabase');
    }).not.toThrow();

    // Restore window
    global.window = originalWindow;
  });

  it('should export supabase client and define proxy without crashing', () => {
    const { supabase } = require('../supabase');
    expect(supabase).toBeDefined();
  });

  it('getSupabase delegates to getSupabaseClient', async () => {
    const mockClient = { from: jest.fn() } as any;
    mockGetSupabaseClient.mockResolvedValueOnce(mockClient);

    const client = await getSupabase();
    expect(client).toHaveProperty('from');
    expect(mockGetSupabaseClient).toHaveBeenCalled();
  });
});
