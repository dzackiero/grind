import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray pnpm-lock.yaml in the home folder makes Next guess the wrong root
  turbopack: { root: __dirname },
  // PGlite ships WebAssembly; keep it out of the bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        // The service worker must never be served from a long-lived cache, or updates would not reach devices
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
