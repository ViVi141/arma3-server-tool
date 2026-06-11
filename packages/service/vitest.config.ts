import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/api/types.d.ts",
        "src/types/**",
        "src/app.ts",
        "src/index.ts",
        "src/process/**",
        "src/steamcmd/**",
        "src/rcon/client.ts",
        "src/api/routes.ts",
        "src/api/health.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
