import type { NextRequest } from 'next/server';

/**
 * Use only for routes that do NOT already go through apiHandler().
 * This wrapper reports thrown exceptions to Sentry without changing
 * Next.js error propagation behavior.
 */
export function withSentryRoute(
  handler: (req: NextRequest) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error, {
          extra: {
            url: req.url,
            method: req.method,
          },
        });
      } catch {
        // Ignore Sentry import/reporting failures.
      }

      throw error;
    }
  };
}
