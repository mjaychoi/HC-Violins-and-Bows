import * as Sentry from '@sentry/nextjs';

/**
 * Next.js 15 서버 사이드 Sentry 초기화
 * - 기존 sentry.server.config.ts 내용을 이곳으로 이동한 형태
 */
export async function register() {
  const isProd = process.env.NODE_ENV === 'production';
  const prodSampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'
  );
  const tracesSampleRate = isProd ? prodSampleRate : 1.0;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate,
    environment: process.env.NODE_ENV,
    enabled:
      process.env.NEXT_RUNTIME !== 'edge' &&
      !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}

// 서버 사이드 요청 에러 훅 (Sentry 권장)
// Nested RSC / 요청 단계에서 발생한 에러를 자동 수집
export const onRequestError = Sentry.captureRequestError;
