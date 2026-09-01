import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images : {
    remotePatterns : [
      {
        protocol : 'https',
        hostname : '*'
      }
    ]
  },
  output : "standalone",
  typescript : {
    ignoreBuildErrors : true,
  }
};

export default nextConfig;
