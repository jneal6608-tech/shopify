import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts", "tests/api/**/*.test.ts"],
    // DB/API suites share one Postgres database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    setupFiles: ["tests/setup-env.ts"],
  },
});
