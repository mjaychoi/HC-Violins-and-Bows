import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';

/**
 * API route용 Sentry 래퍼
 * - handler 내부에서 throw 되는 에러만 Sentry에 보고
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
      try {
        Sentry.captureException(err, {
          extra: {
            url: req.url,
            method: req.method,
          },
        });
      } catch {
        // Sentry 오류는 API 동작에 영향을 주지 않음
      }
      throw err;
    }
  };
}
