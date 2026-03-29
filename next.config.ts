import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.CAPACITOR_BUILD ? "export" : undefined,
  /* config options here */
};

export default nextConfig;
