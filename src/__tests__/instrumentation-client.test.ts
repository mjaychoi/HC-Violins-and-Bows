/**
 * Smoke test for instrumentation-client.ts
 * Tests that the register function executes without errors
 */

// Mock Sentry before importing the module
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRouterTransitionStart: jest.fn(),
}));

describe('instrumentation-client.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export register function', async () => {
    const instrumentation = await import('../instrumentation-client');
    expect(instrumentation.register).toBeDefined();
    expect(typeof instrumentation.register).toBe('function');
  });

  it('should call Sentry.init when register is executed', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation-client');

    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      NEXT_RUNTIME: 'nodejs',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    } as any;

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalled();
  });

  it('should disable tracing on client even in production (bundle optimization)', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation-client');

    // Mock window for client-side test
    const originalWindow = global.window;
    delete (global as any).window;
    global.window = {} as any;

    process.env = {
      ...process.env,
      NODE_ENV: 'production' as const,
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      SENTRY_TRACES_SAMPLE_RATE: '0.05',
    } as typeof process.env;

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        // Client-side always disables tracing for bundle size optimization
        tracesSampleRate: 0,
      })
    );

    // Restore window
    global.window = originalWindow;
  });

  it('should disable tracing on client (bundle size optimization)', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation-client');

    // Mock window for client-side test
    const originalWindow = global.window;
    delete (global as any).window;
    global.window = {} as any;

    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
    } as any;

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0, // Client: tracing disabled
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      })
    );

    // Restore window
    global.window = originalWindow;
  });

  it('should export onRouterTransitionStart', async () => {
    const instrumentation = await import('../instrumentation-client');

    expect(instrumentation.onRouterTransitionStart).toBeDefined();
    // onRouterTransitionStart is now a wrapper function, not direct reference
    expect(typeof instrumentation.onRouterTransitionStart).toBe('function');
  });
});
