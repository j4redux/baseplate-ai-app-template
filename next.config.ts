import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: 'www.gravatar.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Properly handle Node.js polyfills in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,  // Disable the crypto polyfill to avoid browser compatibility issues
        stream: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
