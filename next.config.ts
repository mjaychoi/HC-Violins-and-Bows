import type { NextConfig } from 'next';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let withBundleAnalyzer: any = (config: NextConfig) => config;
try {
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === '1',
  });
} catch {}

const baseConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  // Set outputFileTracingRoot to avoid workspace root detection warning
  outputFileTracingRoot: path.join(__dirname),
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 1 day
  },
  experimental: {
    optimizePackageImports: [
      'date-fns',
      'react-window',
      'recharts',
      '@react-pdf/renderer',
      'react-big-calendar',
    ],
    // Turbopack HMR 안정성 개선
    // Note: @swc/helpers 모듈 HMR 오류가 발생하면 dev:webpack 스크립트 사용 권장
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

const nextConfig = withBundleAnalyzer(baseConfig);
export default nextConfig;
