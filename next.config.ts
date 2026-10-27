import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray pnpm-lock.yaml in the home folder makes Next guess the wrong root
  turbopack: { root: __dirname },
  // PGlite ships WebAssembly; keep it out of the bundle
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
