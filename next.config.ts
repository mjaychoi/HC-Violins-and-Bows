import type { NextConfig } from 'next';
import path from 'path';

let withBundleAnalyzer = (config: NextConfig): NextConfig => config;
try {
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === '1',
  });
} catch {}

// Sentry 플러그인 (소스맵 업로드 / 릴리즈 태깅용)
type NextConfigWrapper = (
  config: NextConfig,
  options?: Record<string, unknown>
) => NextConfig;

let withSentryConfig: NextConfigWrapper = (_config: NextConfig) => _config;
try {
  // require 사용: dev 환경에서 @sentry/nextjs 미설치여도 앱이 깨지지 않도록
  const { withSentryConfig: sentryWrapper } = require('@sentry/nextjs');
  withSentryConfig = sentryWrapper;
} catch {
  // Sentry 미설치 시에는 그대로 통과
}

const baseConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  // Set outputFileTracingRoot to avoid workspace root detection warning
  outputFileTracingRoot: path.join(__dirname),
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 1 day
    // 외부 이미지 도메인 허용 (Supabase Storage 등)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // Lazy loading 기본 활성화 (priority prop으로 override 가능)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: [
      'date-fns',
      'react-window',
      'recharts',
      // react-big-calendar removed: causes barrel optimization issues with dateFnsLocalizer
      // 'react-big-calendar',
    ],
    // Turbopack HMR 안정성 개선
    // Note: @swc/helpers 모듈 HMR 오류가 발생하면 dev:webpack 스크립트 사용 권장
    // Note: @react-pdf/renderer is excluded from optimizePackageImports
    // because it's server-only and causes conflicts with serverExternalPackages
  },
  // serverComponentsExternalPackages has been moved from experimental to top-level
  // @react-pdf/renderer is only used in server components (API routes), not in client components
  serverExternalPackages: [
    '@react-pdf/renderer',
    '@react-pdf/reconciler',
    '@react-pdf/render',
  ],
  // Webpack config applies to both dev and production when using Webpack (not Turbopack)
  webpack: (config, { isServer, dev }) => {
    // Optimize bundle size: prevent client-side bundling of server-only dependencies
    if (!isServer) {
      // Externalize server-only packages for client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };

      // 개발 모드에서도 코드 스플리팅 최적화 적용
      if (dev) {
        config.optimization = {
          ...config.optimization,
          splitChunks: {
            ...config.optimization.splitChunks,
            chunks: 'all',
            cacheGroups: {
              ...config.optimization.splitChunks?.cacheGroups,
              // Supabase SDK 별도 청크
              supabase: {
                test: /[\\/]node_modules[\\/](@supabase|tr46|whatwg-url)[\\/]/,
                name: 'supabase',
                chunks: 'all',
                priority: 30,
                reuseExistingChunk: true,
              },
              // Recharts 별도 청크 (큰 라이브러리)
              recharts: {
                test: /[\\/]node_modules[\\/]recharts[\\/]/,
                name: 'recharts',
                chunks: 'all',
                priority: 25,
                reuseExistingChunk: true,
              },
              // React PDF 별도 청크
              reactPdf: {
                test: /[\\/]node_modules[\\/]@react-pdf[\\/]/,
                name: 'react-pdf',
                chunks: 'all',
                priority: 25,
                reuseExistingChunk: true,
              },
              // React Big Calendar 별도 청크
              reactBigCalendar: {
                test: /[\\/]node_modules[\\/]react-big-calendar[\\/]/,
                name: 'react-big-calendar',
                chunks: 'all',
                priority: 25,
                reuseExistingChunk: true,
              },
            },
          },
        };
      } else {
        // Production 최적화
        config.optimization = {
          ...config.optimization,
          splitChunks: {
            ...config.optimization.splitChunks,
            cacheGroups: {
              ...config.optimization.splitChunks?.cacheGroups,
              // Isolate Supabase SDK and its dependencies into separate chunk
              supabase: {
                test: /[\\/]node_modules[\\/](@supabase|tr46|whatwg-url)[\\/]/,
                name: 'supabase',
                chunks: 'all',
                priority: 30,
                reuseExistingChunk: true,
              },
            },
          },
        };
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/:all*(js|css|svg|png|jpg|jpeg|gif|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

// Sentry + Bundle Analyzer를 순차적으로 래핑
const withAll = (config: NextConfig): NextConfig => {
  const withSentryApplied = withSentryConfig(config, {
    // Sentry 빌드 타임 옵션 (환경 변수와 연동)
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // 대략적인 예시 옵션들 (필요 시 조정 가능)
    silent: true,
    disableServerWebpackPlugin: false,
    disableClientWebpackPlugin: false,
  });

  return withBundleAnalyzer(withSentryApplied);
};

const nextConfig = withAll(baseConfig);
export default nextConfig;
