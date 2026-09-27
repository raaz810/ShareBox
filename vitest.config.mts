import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database and the global cleanup lock
    fileParallelism: false,
    testTimeout: 30000,
    // Set TEST_DATABASE_URL to keep test runs (which execute real cleanup) away from dev data
    env: (() => {
      const env = loadEnv("", process.cwd(), "");
      return { ...env, DATABASE_URL: env.TEST_DATABASE_URL || env.DATABASE_URL, NODE_ENV: "test" };
    })(),
  },
});
