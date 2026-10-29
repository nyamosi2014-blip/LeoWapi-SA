import { defineConfig } from "vitest/config";

// Database tests: need PostgreSQL 16 with PostGIS. See tests/db/README.md.
export default defineConfig({
  test: { include: ["tests/db/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
});
