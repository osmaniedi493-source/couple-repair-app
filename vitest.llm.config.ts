import path from "path";
import { defineConfig } from "vitest/config";

// Separate config for the live-LLM regression suite: hits the real DeepSeek
// API (costs money, network-dependent, non-deterministic), so it is never
// part of the default `pnpm test` run. Invoke explicitly with `pnpm run test:llm`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  test: {
    environment: "node",
    include: ["**/*.llm.test.ts"],
    testTimeout: 90000,
    hookTimeout: 30000
  }
});
