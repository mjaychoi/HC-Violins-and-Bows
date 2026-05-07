/**
 * Next.js 15 서버 사이드 instrumentation
 * ✅ FIXED: Next.js 15 권장 방식 - sentry.server.config.ts 내용을 여기로 이동
 *
 * ⚠️ CRITICAL: NO static imports at top level to prevent client bundle inclusion
 * - ALL imports must be dynamic and inside functions
 * - Webpack analyzes imports at build time, so runtime checks are not enough
 */
export async function register() {
  // Only run on Node.js runtime (server-side)
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const { validateStorageRuntimeConfig } =
      await import('./utils/storage/config');
    validateStorageRuntimeConfig();
  } catch (error) {
    const { Logger } = await import('./utils/logger');
    Logger.error(
      '[instrumentation] Storage configuration invalid',
      error,
      'instrumentation'
    );
    throw error;
  }

  try {
    const { assertSchemaReadiness } =
      await import('./app/api/_utils/schemaReadiness');
    await assertSchemaReadiness({ bypassCache: true });
  } catch (error) {
    const { Logger } = await import('./utils/logger');
    Logger.warn(
      '[instrumentation] Schema readiness check failed — server will start but some API routes may return 503 until migrations are applied',
      'instrumentation',
      { reason: error instanceof Error ? error.message : String(error) }
    );
    // Do not re-throw: a missing migration should degrade gracefully rather than
    // prevent the server from starting entirely. Routes that depend on the
    // missing schema will return 503 on their own.
  }

  // ✅ CRITICAL: Dynamic import to prevent webpack from including Sentry in client bundle
  try {
    const Sentry = await import('@sentry/nextjs');

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Server-side tracing enabled (for performance monitoring)
      tracesSampleRate:
        process.env.NODE_ENV === 'production'
          ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05') || 0.05
          : 1.0,
      beforeSend(event) {
        const minLevel = (
          process.env.SENTRY_MIN_LEVEL || 'error'
        ).toLowerCase();
        const rank: Record<string, number> = {
          debug: 0,
          info: 1,
          log: 1,
          warning: 2,
          error: 3,
          fatal: 4,
        };
        const eventLevel = event.level || 'error';
        const threshold = minLevel in rank ? rank[minLevel] : rank.error;
        return (rank[eventLevel] ?? rank.error) >= threshold ? event : null;
      },
    });
  } catch (error) {
    const { Logger } = await import('./utils/logger');
    Logger.warn(
      '[instrumentation] Sentry initialization skipped',
      'instrumentation',
      {
        reason: error instanceof Error ? error.message : String(error),
      }
    );
  }

  // Optional: OpenTelemetry initialization (if needed)
  // try {
  //   const { registerOTel } = await import('@vercel/otel');
  //   registerOTel();
  // } catch {
  //   // OTel not available
  // }
}

// ✅ Server-side request error hook (Sentry recommended)
// Nested RSC / request-level errors are automatically captured
export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
  }
) => {
  // Only run on server
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const Sentry = await import('@sentry/nextjs');
    // captureRequestError expects 3 arguments: (err, request, context)
    Sentry.captureRequestError(err, request, context);
  } catch {
    // Sentry not available - ignore
  }
};
