import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN, // ← 연결 지점
  tracesSampleRate: 1.0, // 성능 수집
});
