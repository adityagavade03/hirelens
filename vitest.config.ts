import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // PDF parsing loads native code; isolate it in processes to avoid Windows thread crashes.
    pool: "forks",
    maxWorkers: 1,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
