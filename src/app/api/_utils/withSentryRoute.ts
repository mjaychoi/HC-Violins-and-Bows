import type { NextRequest } from 'next/server';

/**
 * API route용 Sentry 래퍼
 * - handler 내부에서 throw 되는 에러만 Sentry에 보고 (Sentry가 설치된 경우)
 * - 응답 기반 캡처는 제거 (중복/노이즈 방지, 민감정보 보호)
 * - Next.js의 기본 에러 핸들링 + 우리의 ErrorHandler가 그대로 동작하게 유지
 */
export function withSentryRoute(
  handler: (req: NextRequest) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (err) {
      // Dynamically import Sentry to avoid build errors if it's not installed
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(err, {
          extra: {
            url: req.url,
            method: req.method,
          },
        });
      } catch {
        // Sentry not available or error occurred - ignore silently
        // API should continue to work without Sentry
      }
      throw err;
    }
  };
}
