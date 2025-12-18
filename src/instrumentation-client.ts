import * as Sentry from '@sentry/nextjs';

/**
 * Next.js 15 클라이언트 사이드 Sentry 초기화
 * - 기존 sentry.client.config.ts 내용을 이곳으로 이동한 형태
 * - Turbopack 사용 시에도 동작하도록 공식 권장 방식 사용
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

// 클라이언트 라우팅 트레이스 훅 (Sentry 권장)
// 페이지 전환 시 성능/네비게이션 이벤트를 자동 수집
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
