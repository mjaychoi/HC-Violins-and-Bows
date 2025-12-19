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
    });
  } catch (error) {
    // Silently fail if Sentry is not available (dev environment)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[instrumentation] Sentry initialization skipped:', error);
    }
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
