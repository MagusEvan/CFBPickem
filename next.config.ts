import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'flagcdn.com' },
      { hostname: 'a.espncdn.com' },
    ],
  },
};

export default nextConfig;
