'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Next.js app router 전역 에러 핸들러
 * - Sentry에 렌더링 에러를 보고
 * - 사용자는 간단한 재시도 / 새로고침 UI를 보게 됨
 * - 앱 내부 ErrorBoundary와는 별도로, 루트 레벨에서 한 번 더 안전망 역할
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <div className="flex items-center mb-4">
            <div className="shrink-0">
              <svg
                className="h-8 w-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h1 className="text-lg font-medium text-gray-900">
                Something went wrong
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                An unexpected error occurred while rendering this page.
              </p>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-400">
            {/* digest가 있으면 디버깅에 도움 */}
            {error.digest && <p>Error ID: {error.digest}</p>}
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={() => reset?.()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
