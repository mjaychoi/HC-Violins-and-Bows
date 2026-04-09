import type { SupabaseClient } from '@supabase/supabase-js';

const mockCreateClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  __esModule: true,
  createClient: (...args: Parameters<typeof mockCreateClient>) => {
    return mockCreateClient(...(args as unknown[]));
  },
}));

const DEFAULT_URL = 'https://example.supabase.co';
const DEFAULT_KEY = 'anon';
const ORIGINAL_WINDOW = global.window;
const GLOBAL_KEY = '__hcv_supabase_client__';

describe('supabase-client helper', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = DEFAULT_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = DEFAULT_KEY;
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    if (global.window === undefined) {
      global.window = ORIGINAL_WINDOW;
    }
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    global.window = ORIGINAL_WINDOW;
  });

  it('initializes the client when valid env vars are present', async () => {
    const mockClient = { from: jest.fn() } as unknown as SupabaseClient;
    mockCreateClient.mockReturnValue(mockClient);

    const { getSupabaseClient, getSupabaseClientSync } =
      require('../supabase-client') as typeof import('../supabase-client');

    const client = await getSupabaseClient();
    expect(client).toBe(mockClient);
    expect(getSupabaseClientSync()).toBe(mockClient);
    expect(mockCreateClient).toHaveBeenCalledWith(
      DEFAULT_URL,
      DEFAULT_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
        }),
        global: expect.objectContaining({
          fetch: expect.any(Function),
        }),
      })
    );
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it('reuses the same singleton client across repeated calls', async () => {
    const mockClient = { from: jest.fn() } as unknown as SupabaseClient;
    mockCreateClient.mockReturnValue(mockClient);

    const { getSupabaseClient, getSupabaseClientSync } =
      require('../supabase-client') as typeof import('../supabase-client');

    const syncClientA = getSupabaseClientSync();
    const syncClientB = getSupabaseClientSync();
    const asyncClient = await getSupabaseClient();

    expect(syncClientA).toBe(mockClient);
    expect(syncClientB).toBe(mockClient);
    expect(asyncClient).toBe(mockClient);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it('throws when required env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { getSupabaseClient, getSupabaseClientSync } =
      require('../supabase-client') as typeof import('../supabase-client');

    await expect(getSupabaseClient()).rejects.toThrow(
      /Missing Supabase environment variables/i
    );
    expect(getSupabaseClientSync()).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Supabase environment variables not set')
    );

    consoleSpy.mockRestore();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('logs an error when the Supabase URL format is invalid', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-valid-url';

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { getSupabaseClientSync } =
      require('../supabase-client') as typeof import('../supabase-client');

    expect(getSupabaseClientSync()).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid Supabase URL format')
    );

    consoleSpy.mockRestore();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('initializes lazily when window is unavailable at import time', async () => {
    const mockClient = { from: jest.fn() } as unknown as SupabaseClient;
    mockCreateClient.mockReturnValue(mockClient);

    (global as unknown as Record<string, unknown>).window = undefined;
    jest.resetModules();

    const supabaseModule =
      require('../supabase-client') as typeof import('../supabase-client');
    (global as unknown as Record<string, unknown>).window = ORIGINAL_WINDOW;

    await expect(supabaseModule.getSupabaseClient()).resolves.toBe(mockClient);
    expect(mockCreateClient).toHaveBeenCalledWith(
      DEFAULT_URL,
      DEFAULT_KEY,
      expect.any(Object)
    );
  });
});
