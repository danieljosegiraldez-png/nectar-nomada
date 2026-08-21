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
    // Real-database integration tests, no mocks. They used to run against
    // production Neon; tests/setup.ts now refuses a remote database unless
    // ALLOW_REMOTE_TEST_DB=1, and `npm run test:db up` restores a local copy
    // from the newest verified backup. The timeout below still matters:
    // ALLOW_REMOTE_TEST_DB runs exist, and a local restore of a Neon dump
    // keeps the same shape and cleanup behaviour.
    //
    // The default 10s was tuned
    // for local/pooled Postgres, not Neon's serverless compute waking from
    // a cold suspend on the first query of a fresh connection. Measured
    // live in this session: e2e.test.ts/reports.test.ts's beforeAll/
    // afterAll repeatedly exceeded 10s even running just the two of them,
    // and passed cleanly at 30s. A timed-out afterAll leaves whatever
    // deleteMany calls hadn't run yet as orphaned rows in real Neon — this
    // is the actual mechanism that left 71 rows behind before A7 cleaned
    // them up (docs/implementation/README.md's A7 section has the full
    // writeup). Raised globally rather than per-file so no test file can
    // silently reintroduce the same failure mode by omission.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
