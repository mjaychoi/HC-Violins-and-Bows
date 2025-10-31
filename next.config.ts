import type { NextConfig } from 'next';

// 선택적 번들 분석기: 로컬에서 ANALYZE=1로 켜기 (패키지 설치 시 동작)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let withBundleAnalyzer: any = (config: NextConfig) => config;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-expect-error: optional peer (dev) dependency
  withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === '1' });
} catch {}

const baseConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: '/Users/soyeonhong/HC-Violins-and-Bows',
  compress: true,
  swcMinify: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 1 day
  },
  experimental: {
    optimizePackageImports: [
      'date-fns',
      'react-window',
    ],
  },
  async headers() {
    return [
      {
        source: '/:all*(js|css|svg|png|jpg|jpeg|gif|webp|avif)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

const nextConfig = withBundleAnalyzer(baseConfig);
export default nextConfig;
