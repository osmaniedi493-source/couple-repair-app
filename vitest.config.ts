import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  test: {
    environment: "node",
    // Live-LLM regression tests are excluded from the default run (cost + network +
    // non-determinism). Run them explicitly with `pnpm run test:llm`.
    exclude: ["**/node_modules/**", "**/*.llm.test.ts"]
  }
});
