import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets phones/tablets on the same WiFi load the dev server via the Mac's LAN IP.
  // Next.js blocks cross-origin dev requests by default; without this, pages loaded
  // via http://192.168.x.x:3000 silently fail to load their JS chunks.
  allowedDevOrigins: ["192.168.*.*"]
};

export default nextConfig;
