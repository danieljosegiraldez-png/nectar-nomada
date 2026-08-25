import "dotenv/config";
// Shared with scripts/dev-guard.ts so both guards agree on what "local" means
// (ADR-084).
import { hostOf, isLocalDatabaseUrl } from "../lib/databaseHost";

/**
 * Decides which database the suite talks to, and refuses to guess.
 *
 * This file used to be one line — `import "dotenv/config"` — which meant the
 * suite inherited `.env`'s DATABASE_URL and ran its 380-odd tests against real
 * production Neon. That was deliberate once (vitest.config.ts still explains
 * why these are real integration tests with no mocks), but it has a cost
 * nobody chose: roughly 244 `core.audit_event` rows per run, plus the
 * occasional dangling `core.scope` when a cleanup hook times out, written into
 * the live research record.
 *
 * It also hides bugs. Two "real data untouched" assertions counted every
 * Location named "Lote" platform-wide and passed only because production
 * happened to hold exactly six; the I1 importer's own plots broke them the
 * moment it ran. Running against a restored copy is what surfaced that.
 *
 * So: `TEST_DATABASE_URL` wins if set. Otherwise a local DATABASE_URL is fine.
 * Otherwise the suite stops and says how to get a local database, rather than
 * quietly writing to production.
 */

const testUrl = (process.env.TEST_DATABASE_URL ?? "").trim();
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
  // The AI client binds its own connection string; point it at the same
  // database unless the caller has already been explicit about it.
  if (!process.env.AI_SERVICE_DATABASE_URL?.includes("127.0.0.1")) {
    process.env.AI_SERVICE_DATABASE_URL = testUrl;
  }
}

const host = hostOf(process.env.DATABASE_URL);

if (!isLocalDatabaseUrl(process.env.DATABASE_URL) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
  throw new Error(
    [
      "",
      `Refusing to run the test suite against a remote database (${host ?? "unparseable DATABASE_URL"}).`,
      "",
      "These are real integration tests with no mocks, so a run writes to whatever",
      "database it is pointed at — roughly 244 audit rows per run against production.",
      "",
      "Get a local copy restored from the newest verified backup:",
      "",
      "  npm run test:db up",
      "",
      "It prints the TEST_DATABASE_URL to export. Then `npm test` as usual.",
      "",
      "If you genuinely mean to run against the remote database, say so explicitly:",
      "",
      "  ALLOW_REMOTE_TEST_DB=1 npm test",
      "",
    ].join("\n"),
  );
}
