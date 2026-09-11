import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.habiv.com" }],
  },
};

export default nextConfig;
