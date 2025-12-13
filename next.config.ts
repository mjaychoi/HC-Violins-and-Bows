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
    optimizePackageImports: ['date-fns', 'react-window'],
  },
  webpack: (config, { isServer }) => {
    // Optimize bundle size: prevent client-side bundling of server-only dependencies
    if (!isServer) {
      // Externalize server-only packages for client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
      
      // Optimize large dependencies that come from Supabase SDK chain
      // tr46/mappingTable.json is part of whatwg-url → tr46 dependency chain
      // These are URL parsing utilities that may not be needed in all client contexts
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
