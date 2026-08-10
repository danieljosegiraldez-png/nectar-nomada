import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // lib/rbac/resolve.ts's tests are pure-logic, no DB needed. Phase 1's
    // traceability tests are the first genuine DB-integration tests in this
    // codebase (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
    // §31) — they need DATABASE_URL loaded before lib/db.ts reads it, which
    // Next.js does automatically but a standalone vitest process does not.
    setupFiles: ["./tests/setup.ts"],
  },
});
