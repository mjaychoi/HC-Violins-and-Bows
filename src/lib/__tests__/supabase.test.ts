describe('supabase', () => {
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
    jest.resetModules();
    const { supabase: testSupabase } = require('../supabase');

    expect(testSupabase).toBeDefined();
    // Supabase client should have 'from' method
    expect(testSupabase).toHaveProperty('from');
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

    jest.resetModules();

    // Should not throw during build
    expect(() => {
      require('../supabase');
    }).not.toThrow();

    // Restore window
    global.window = originalWindow;
  });

  it('should export supabase client', () => {
    jest.resetModules();
    const { supabase } = require('../supabase');
    expect(supabase).toBeDefined();
    expect(supabase).toHaveProperty('from');
  });
});
