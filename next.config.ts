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
      {
        protocol: 'https',
        hostname: 'orrbvrpvawnbmirbyaxu.supabase.co',
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
