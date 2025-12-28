import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'commons.wikimedia.org',
      },
    ],
    localPatterns: [
      {
        pathname: '/api/image/**',
      },
      {
        pathname: '/generated-artworks/**',
      },
    ],
  },
};

export default nextConfig;
