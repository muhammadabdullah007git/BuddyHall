import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.ELECTRON_BUILD ? "export" : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
