import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws outside React Server Components; tests run server code directly
      "server-only": path.resolve(__dirname, "src/test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    // Every database test file starts its own in-memory Postgres and runs the migrations in beforeAll. With many
    // files running at once on a busy machine that can pass the 10 s default and skip the whole file.
    hookTimeout: 60_000,
  },
});
