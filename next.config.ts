import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // A stray pnpm-lock.yaml in the home folder makes Next guess the wrong root
  turbopack: { root: __dirname },
  // PGlite ships WebAssembly; keep it out of the bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Pages are rendered per request (they read the signed-in athlete), and Next 15 keeps none of them in the
    // browser's router cache by default, so every tap waited on the server. Keeping a visited or prefetched page
    // for 30 s makes switching tabs instant. Saving a change, syncing or router.refresh() clears the cache, so
    // the athlete's own edits show at once; an edit made elsewhere (Claude over MCP) shows within 30 s.
    staleTimes: { dynamic: 30, static: 30 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") },
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
