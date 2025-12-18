/**
 * Smoke test for instrumentation.ts
 * Tests that the register function executes without errors
 */

// Mock Sentry before importing the module
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRequestError: jest.fn(),
}));

describe('instrumentation.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export register function', async () => {
    const instrumentation = await import('../instrumentation');
    expect(instrumentation.register).toBeDefined();
    expect(typeof instrumentation.register).toBe('function');
  });

  it('should call Sentry.init when register is executed', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation');

    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      NEXT_RUNTIME: 'nodejs',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    };

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalled();
  });

  it('should use production sample rate in production', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation');

    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      NEXT_RUNTIME: 'nodejs',
      SENTRY_TRACES_SAMPLE_RATE: '0.05',
    } as any;

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.05,
      })
    );
  });

  it('should use default sample rate when SENTRY_TRACES_SAMPLE_RATE is not set', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation');

    const env: any = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      NEXT_RUNTIME: 'nodejs',
    };
    delete env.SENTRY_TRACES_SAMPLE_RATE;
    process.env = env;

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.05, // Default value
      })
    );
  });

  it('should use full sample rate (1.0) in non-production', async () => {
    const Sentry = require('@sentry/nextjs');
    const instrumentation = await import('../instrumentation');

    process.env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_PUBLIC_SENTRY_DSN: 'test-dsn',
      NEXT_RUNTIME: 'nodejs',
    };

    await instrumentation.register();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1.0,
      })
    );
  });

  it('should export onRequestError', async () => {
    const instrumentation = await import('../instrumentation');
    const Sentry = require('@sentry/nextjs');

    expect(instrumentation.onRequestError).toBeDefined();
    expect(instrumentation.onRequestError).toBe(Sentry.captureRequestError);
  });
});
