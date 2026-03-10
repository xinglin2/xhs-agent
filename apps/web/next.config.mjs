/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xhs/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.cdn.xhsagent.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.xhsagent.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
