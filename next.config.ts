import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'flagcdn.com' },
      { hostname: 'a.espncdn.com' },
      // CFBD serves team logos from its own CDN, not ESPN's
      { hostname: 'cdn.collegefootballdata.com' },
    ],
  },
};

export default nextConfig;
