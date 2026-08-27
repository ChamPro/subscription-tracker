import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      // Only the logic layer is worth measuring: pure helpers, cache/query
      // layer, and server actions. Everything else is either generated,
      // presentational, or has no unit tests.
      include: ["src/lib/**/*.ts", "src/app/**/actions.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.config.*",
        "src/generated/**",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/components/**",
        "scripts/**",
        "src/lib/demo-data.ts",
        // Module-level wiring (PrismaClient singleton, NextAuth init): always
        // mocked in tests, no testable branches, so their 0% is permanent and
        // would only drag the thresholds down artificially.
        "src/lib/auth.ts",
        "src/lib/prisma.ts",
      ],
      // Baseline at time of writing: 96.15 / 95.35 / 100 / 95.97.
      // functions is pinned at 100 on purpose: any new function must ship
      // with a test that exercises it.
      thresholds: {
        statements: 90,
        branches: 88,
        functions: 100,
        lines: 90,
      },
    },
  },
});
