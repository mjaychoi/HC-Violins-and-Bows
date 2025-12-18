/**
 * Next.js 15 클라이언트 사이드 Sentry 초기화
 * ✅ FIXED: Next.js 15 권장 방식 - sentry.client.config.ts 내용을 여기로 이동
 *
 * ⚠️ IMPORTANT: Minimal client-side initialization to reduce bundle size
 * - Tracing disabled (saves ~2-3MB bundle size)
 * - Replay disabled (saves ~1-2MB bundle size)
 * - Only error tracking enabled (lightweight)
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Only run on client-side
  if (typeof window === 'undefined') {
    return;
  }

  // ✅ Client-side Sentry with minimal bundle impact
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // ✅ Disable tracing on client (saves ~2-3MB bundle size)
    // Client-side tracing has minimal UX benefit vs. cost
    tracesSampleRate: 0,

    // ✅ Disable replay (saves ~1-2MB bundle size)
    // Replay is useful but expensive for bundle size
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Only enable error tracking (lightweight)
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}

// ✅ Client-side router transition hook (Sentry recommended)
// Page navigation events are automatically captured
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
